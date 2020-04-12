/**
 * Copyright (C) 2016-2020 Auralia
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {IncomingMessage} from "http";
import clone from "clone";
import https from "https";
import xml2js from "xml2js";

/**
 * @hidden
 */
const xmlParser = new xml2js.Parser({
    charkey: "value",
    trim: true,
    normalizeTags: true,
    normalize: true,
    explicitRoot: false,
    explicitArray: false,
    mergeAttrs: true,
    attrValueProcessors: [(value: any) => {
        let num = Number(value);
        if (!isNaN(num)) {
            return num;
        } else {
            return value;
        }
    }],
    valueProcessors: [(value: any) => {
        let num = Number(value);
        if (!isNaN(num)) {
            return num;
        } else {
            return value;
        }
    }]
});

/**
 * The version of nsapi.
 */
export const VERSION = "0.2.0";

/**
 * The version specified in API requests.
 */
export const API_VERSION = 10;

/**
 * The council specified in World Assembly API requests.
 */
export enum WorldAssemblyCouncil {
    /**
     * General Assembly.
     */
    GeneralAssembly = 1,
    /**
     * Security Council.
     */
    SecurityCouncil = 2
}

/**
 * The telegram type for rate limit purposes. Recruitment telegrams have a
 * stricter rate limit than non-recruitment telegrams.
 */
export enum TelegramType {
    /**
     * Recruitment telegrams.
     */
    Recruitment,
    /**
     * Non-recruitment telegrams.
     */
    NonRecruitment
}

/**
 * Used to authenticate with the nation API in order to use private shards or
 * nation commands. Private shards provide access to information that is only
 * available to logged-in nations, while nation commands allow nations to
 * perform actions that require being logged-in.
 */
export interface Auth {
    /**
     * The password of the nation specified in the nation API request. This
     * only needs to be provided if a PIN or autologin string is not specified.
     */
    password?: string;
    /**
     * The PIN to be used to authenticate the nation API request. It will keep
     * working until you log out, log in again, or go idle for two hours.
     *
     * You probably don't know what this is initially. If updatePin is enabled,
     * this value will be updated with the PIN retrieved after the first
     * request using this object.
     */
    pin?: string;
    /**
     * If true, updates the value of pin with the value of the X-PIN header
     * the first time this object is used in a request.
     */
    updatePin?: boolean;
    /**
     * The autologin string to be used to authenticate the nation API request.
     * It is an encrypted version of your password that will keep working
     * until your password is changed.
     *
     * You probably don't know what this is initially. If updateAutologin is
     * enabled, this value will be updated with the autologin string retrieved
     * after the first request using this object.
     */
    autologin?: string;
    /**
     * If true, updates the value of autologin with the value of the
     * X-Autologin header the first time this object is used in a request.
     */
    updateAutologin?: boolean;
}

/**
 * This error is thrown after a failed API request and contains additional
 * information about the failed request.
 */
export class ApiError extends Error {
    /**
     * The message associated with the error.
     */
    public message: string;
    /**
     * The HTTP response metadata returned by the NationStates website.
     */
    public responseMetadata?: IncomingMessage;
    /**
     * The HTTP response text returned by the API.
     */
    public responseText?: string;

    /**
     * Initializes a new instance of the ApiError class.
     *
     * @param message The message associated with the error.
     * @param responseMetadata The HTTP response metadata returned by the
     *                         NationStates website.
     * @param responseText The HTTP response text returned by the API.
     */
    constructor(message: string, responseMetadata?: IncomingMessage,
                responseText?: string)
    {
        super(message);
        this.message = message;
        this.responseMetadata = responseMetadata;
        this.responseText = responseText;
    }
}

/**
 * An HTTP response.
 *
 * @hidden
 */
interface HttpResponse {
    metadata: IncomingMessage,
    text: string
}

/**
 * Options to configure nsapi.
 */
export interface NsApiOptions {
    /**
     * Whether a delay is introduced before API and telegram requests. Defaults
     * to true.
     */
    delay?: boolean;
    /**
     * The delay before API requests in milliseconds. Defaults to 600.
     */
    apiDelayMillis?: number;
    /**
     * The delay before non-recruitment telegram requests in milliseconds.
     * Defaults to 60000.
     */
    nonRecruitTgDelayMillis?: number;
    /**
     * The delay before recruitment telegram requests in milliseconds. Defaults
     * to 180000.
     */
    recruitTgDelayMillis?: number;
    /**
     * Whether API requests should be cached. Defaults to true.
     */
    cacheApiRequests?: boolean;
    /**
     * The number of seconds that API requests should stay cached. Defaults to
     * 900.
     */
    cacheTime?: number;
    /**
     * Allows API requests immediately after the API is initialized. Defaults to
     * true.
     */
    allowImmediateApiRequests?: boolean;
    /**
     * Allows telegram requests immediately after the API is initialized.
     * Defaults to true.
     */
    allowImmediateTgRequests?: boolean;
}

/**
 * Provides access to the NationStates API.
 */
export class NsApi {
    private _userAgent: string = "";
    private _delay: boolean = true;
    private _apiDelayMillis: number = 600;
    private _recruitTgDelayMillis: number = 60000;
    private _nonRecruitTgDelayMillis: number = 180000;

    private readonly _queue: {
        tg: TelegramType | undefined;
        func: () => void;
        reject: (err: any) => void;
    }[] = [];
    private _interval: any;
    private _lastRequestTime: number;
    private _lastTgTime: number;
    private _requestInProgress: boolean = false;

    private _cacheApiRequests: boolean = true;
    private readonly _cache: {
        [url: string]: {
            time: number,
            data: any
        }
    } = {};
    private _cacheTime: number = 900;

    private _blockExistingRequests: boolean = false;
    private _blockNewRequests: boolean = false;
    private _cleanup: boolean = false;

    /**
     * Initializes a new instance of the NsApi class.
     *
     * @param userAgent A string identifying you to the NationStates API.
     *                  Using the name of your main nation is recommended.
     * @param options Other options.
     */
    constructor(userAgent: string, options: NsApiOptions) {
        this.userAgent = userAgent;
        if (options.delay !== undefined) {
            this.delay = options.delay;
        }
        if (options.apiDelayMillis !== undefined) {
            this.apiDelayMillis = options.apiDelayMillis;
        }
        if (options.nonRecruitTgDelayMillis !== undefined) {
            this.nonRecruitTgDelayMillis = options.nonRecruitTgDelayMillis;
        }
        if (options.recruitTgDelayMillis !== undefined) {
            this.recruitTgDelayMillis = options.recruitTgDelayMillis;
        }

        if (options.allowImmediateApiRequests !== false) {
            this._lastRequestTime = Date.now() - this.apiDelayMillis;
        } else {
            this._lastRequestTime = Date.now();
        }
        if (options.allowImmediateApiRequests !== false) {
            this._lastTgTime = Date.now() - this.recruitTgDelayMillis;
        } else {
            this._lastTgTime = Date.now();
        }

        this.initInterval();

        this._cache = {};
        if (options.cacheApiRequests !== undefined) {
            this.cacheApiRequests = options.cacheApiRequests;
        }
        if (options.cacheTime !== undefined) {
            this.cacheTime = options.cacheTime;
        }
    }

    /**
     * Gets a string identifying you to the NationStates API.
     */
    public get userAgent() {
        return this._userAgent;
    }

    /**
     * Sets a string identifying you to the NationStates API. Using the name of
     * your main nation is recommended.
     */
    public set userAgent(userAgent: string) {
        if (typeof userAgent !== "string") {
            throw new Error("A valid user agent must be defined in"
                            + " order to use the NationStates API");
        }
        this._userAgent = `node-nsapi ${VERSION} (maintained by Auralia,`
                          + ` currently used by "${userAgent}")`;
    }

    /**
     * Gets whether a delay is introduced before API and telegram requests.
     */
    public get delay() {
        return this._delay;
    }

    /**
     * Sets a value indicating whether a delay is introduced before API and
     * telegram requests.
     *
     * Setting this value re-initializes the API scheduler.
     */
    public set delay(delay: boolean) {
        this._delay = delay;
        this.initInterval();
    }

    /**
     * Gets the delay before API requests in milliseconds.
     */
    public get apiDelayMillis() {
        return this._apiDelayMillis;
    }

    /**
     * Sets the delay before API requests in milliseconds. Must be greater than
     * or equal to 600.
     */
    public set apiDelayMillis(apiDelayMillis: number) {
        if (apiDelayMillis < 600) {
            throw new RangeError("API delay must be greater than or"
                                 + " equal to 600");
        }
        this._apiDelayMillis = apiDelayMillis;
    }

    /**
     * Gets the delay before non-recruitment telegram requests in milliseconds.
     */
    public get nonRecruitTgDelayMillis() {
        return this._nonRecruitTgDelayMillis;
    }

    /**
     * Sets the delay before non-recruitment telegram requests in milliseconds.
     * Must be greater than or equal to 60000.
     */
    public set nonRecruitTgDelayMillis(nonRecruitTgDelayMillis: number) {
        if (nonRecruitTgDelayMillis < 60000)
        {
            throw new RangeError("Non-recruitment telegram delay must"
                                 + " be greater than or equal to 60000");
        }
        this._nonRecruitTgDelayMillis = nonRecruitTgDelayMillis;
    }

    /**
     * Gets the delay before recruitment telegram requests in milliseconds.
     * Must be greater than or equal to 180000.
     */
    public get recruitTgDelayMillis() {
        return this._recruitTgDelayMillis;
    }

    /**
     * Sets the delay before recruitment telegram requests in milliseconds.
     */
    public set recruitTgDelayMillis(recruitTgDelayMillis: number) {
        if (recruitTgDelayMillis < 180000)
        {
            throw new RangeError("Recruitment telegram delay must be"
                                 + " greater than or equal to 180000");
        }
        this._recruitTgDelayMillis = recruitTgDelayMillis;
    }

    /**
     * Gets whether the API is blocked from performing any further requests.
     */
    public get blockExistingRequests() {
        return this._blockExistingRequests;
    }

    /**
     * Sets whether the API is blocked from performing any further requests.
     */
    public set blockExistingRequests(blockExistingRequests: boolean) {
        this._blockExistingRequests = blockExistingRequests;
    }

    /**
     * Gets whether new API requests are blocked from being added to the queue.
     */
    public get blockNewRequests() {
        return this._blockNewRequests;
    }

    /**
     * Sets whether new API requests are blocked from being added to the queue.
     */
    public set blockNewRequests(blockNewRequests: boolean) {
        this._blockNewRequests = blockNewRequests;
    }

    /**
     * Gets whether an API request is in progress.
     */
    public get requestInProgress() {
        return this._requestInProgress;
    }

    /**
     * Gets whether there is at least one API request in the queue.
     */
    public get requestsQueued() {
        return this._queue.length !== 0;
    }

    /**
     * Cancels all API requests in the queue.
     */
    public clearQueue(): void {
        while (this._queue.length > 0) {
            this._queue.pop()!.reject(new Error(
                "Request cancelled: clearQueue function was called"));
        }
    }

    /**
     * Gets whether API requests should be cached.
     */
    public get cacheApiRequests() {
        return this._cacheApiRequests;
    }

    /**
     * Sets whether API requests should be cached.
     */
    public set cacheApiRequests(cacheApiRequests: boolean) {
        this._cacheApiRequests = cacheApiRequests;
    }

    /**
     * Gets the number of seconds that API requests should stay cached.
     */
    public get cacheTime() {
        return this._cacheTime;
    }

    /**
     * Sets the number of seconds that API requests should stay cached.
     */
    public set cacheTime(cacheTime: number) {
        if (cacheTime <= 0)
        {
            throw new RangeError("Cache time must be greater than 0");
        }
        this._cacheTime = cacheTime;
    }

    /**
     * Clears the API request cache.
     */
    public clearCache(): void {
        for (const uri in this._cache) {
            if (this._cache.hasOwnProperty(uri)) {
                delete this._cache[uri];
            }
        }
    }

    /**
     * Cancels all requests in the API queue and turns off the API scheduler.
     *
     * After this function is called, no further requests can be made using
     * this API instance, including requests currently in the queue.
     */
    public cleanup(): void {
        clearInterval(this._interval);
        this.clearQueue();
        this._cleanup = true;
    }

    /**
     * Requests data from the NationStates nation API.
     *
     * @param nation The name of the nation to request data for.
     * @param shards An array of nation API shards. No shards will be specified
     *               if left undefined.
     * @param shardParams Additional shard-specific parameters.
     * @param auth Authentication information for private shards.
     * @param disableCache If the request cache is enabled, disable it for
     *                     this request.
     *
     * @return A promise providing data from the API.
     */
    public async nationRequest(
        nation: string,
        shards: string[] = [],
        shardParams: { [paramName: string]: string } = {},
        auth?: Auth,
        disableCache: boolean = false): Promise<any>
    {
        const globalParams = {"nation": NsApi.toId(nation)};
        return await this.xmlRequest(shards, shardParams, globalParams,
                                     auth, disableCache);
    }

    /**
     * Executes a NationStates nation command. Even if request caching is
     * enabled, these requests are never cached.
     *
     * @param auth Authentication information for private shards.
     * @param nation The name of the nation to execute a command for.
     * @param command The command to execute.
     * @param commandParams Additional command-specific parameters.
     * @param requiresPrepare Whether this command requires a prepare.
     *
     * @return A promise providing data from the API.
     */
    public async nationCommandRequest(
        auth: Auth,
        nation: string,
        command: string,
        commandParams: { [name: string]: string } = {},
        requiresPrepare: boolean = true): Promise<any>
    {
        if (requiresPrepare && auth.updatePin !== true
            && auth.pin === undefined)
        {
            throw new ApiError(
                "When executing a nation command that requires a prepare,"
                + " either auth.pin must be set or auth.updatePin must be"
                + " true");
        }

        commandParams["nation"] = NsApi.toId(nation);
        commandParams["c"] = command;
        if (requiresPrepare) {
            commandParams["mode"] = "prepare";
            const prepareResponse = await this.xmlRequest(
                [], {}, commandParams, auth, true);
            if ("success" in prepareResponse) {
                commandParams["mode"] = "execute";
                commandParams["token"] = prepareResponse["success"];
                return await this.xmlRequest([], {}, commandParams, auth, true);
            } else {
                return prepareResponse;
            }
        } else {
            return await this.xmlRequest([], {}, commandParams, auth, true);
        }
    }

    /**
     * Requests data from the NationStates region API.
     *
     * @param region The name of the region to request data for.
     * @param shards An array of region API shards. No shards will be specified
     *               if left undefined.
     * @param shardParams Additional shard-specific parameters.
     * @param disableCache If the request cache is enabled, disable it for
     *                     this request.
     *
     * @return A promise providing data from the API.
     */
    public async regionRequest(
        region: string,
        shards: string[] = [],
        shardParams: { [paramName: string]: string } = {},
        disableCache: boolean = false): Promise<any>
    {
        const globalParams = {"region": NsApi.toId(region)};
        return await this.xmlRequest(shards, shardParams, globalParams,
                                     undefined, disableCache);
    }

    /**
     * Requests data from the NationStates world API.
     *
     * This API can also be used to request information from the trading cards
     * API if the "card" or "cards" shard is supplied.
     *
     * @param shards An array of world or trading card API shards. No shards
     *               will be specified if left undefined.
     * @param shardParams Additional shard-specific parameters.
     * @param disableCache If the request cache is enabled, disable it for
     *                     this request.
     *
     * @return A promise providing data from the API.
     */
    public async worldRequest(
        shards: string[] = [],
        shardParams: { [paramName: string]: string } = {},
        disableCache: boolean = false): Promise<any>
    {
        return await this.xmlRequest(shards, shardParams, {}, undefined,
                                     disableCache);
    }

    /**
     * Requests data from the NationStates World Assembly API.
     *
     * @param council The council of the World Assembly to request data for.
     * @param shards An array of World Assembly API shards. No shards will be
     *               specified if left undefined.
     * @param shardParams Additional shard-specific parameters.
     * @param disableCache If the request cache is enabled, disable it for
     *                     this request.
     *
     * @return A promise providing data from the API.
     */
    public async worldAssemblyRequest(
        council: WorldAssemblyCouncil,
        shards: string[] = [],
        shardParams: { [paramName: string]: string } = {},
        disableCache: boolean = false): Promise<any>
    {
        const globalParams = {"wa": String(council)};
        return await this.xmlRequest(shards, shardParams, globalParams,
                                     undefined, disableCache);
    }

    /**
     * Sends a telegram using the NationStates telegram API. Even if request
     * caching is enabled, these requests are never cached.
     *
     * @param clientKey The client key.
     * @param tgId The ID of the telegram API template.
     * @param tgSecretKey The secret key of the telegram API template.
     * @param recipient The name of the recipient.
     * @param type The telegram type for rate limit purposes.
     *
     * @return A promise providing confirmation from the telegram API.
     */
    public async telegramRequest(clientKey: string, tgId: string,
                                 tgSecretKey: string, recipient: string,
                                 type: TelegramType): Promise<void>
    {
        let params = "a=sendTG";
        params += "&client=" + encodeURIComponent(clientKey);
        params += "&tgid=" + encodeURIComponent(tgId);
        params += "&key=" + encodeURIComponent(tgSecretKey);
        params += "&to=" + encodeURIComponent(NsApi.toId(recipient));

        const response = await this.apiRequest(this.apiPath(params), type,
                                               undefined);
        if (!(typeof response.text === "string"
              && response.text
                         .trim()
                         .toLowerCase() === "queued"))
        {
            throw new ApiError(
                "Telegram API request failed:"
                + " response did not consist of"
                + " the string 'queued'",
                response.metadata,
                response.text);
        }
    }

    /**
     * Sends an authentication request using the NationStates authentication
     * API.
     *
     * Note that authentication requests are never cached.
     *
     * @param nation The nation to authenticate.
     * @param checksum The checksum to perform authentication with.
     * @param token Site-specific token. No token will be specified if this
     *              value is left undefined.
     *
     * @return A promise returning true if authenticated or false if not
     *         authenticated.
     */
    public async authenticateRequest(nation: string, checksum: string,
                                     token?: string): Promise<boolean>
    {
        let params = "a=verify";
        params += "&nation=" + encodeURIComponent(NsApi.toId(nation));
        params += "&checksum=" + encodeURIComponent(checksum);
        if (token) {
            params += "&token=" + encodeURIComponent(token);
        }

        const response = await this.apiRequest(this.apiPath(params),
                                               undefined,
                                               undefined);
        if (typeof response.text === "string"
            && response.text.trim() === "1")
        {
            return true;
        } else if (typeof response.text === "string"
                   && response.text.trim() === "0")
        {
            return false;
        } else {
            throw new ApiError(
                "Authentication API request failed:"
                + " response did not consist of the string"
                + " '1' or '0'",
                response.metadata,
                response.text);
        }
    }

    /**
     * Initializes the API scheduler.
     */
    private initInterval(): void {
        clearInterval(this._interval);
        if (this.delay) {
            this._interval = setInterval(() => {
                if (this.requestInProgress
                    || this._queue.length === 0
                    || this.blockExistingRequests)
                {
                    return;
                }

                let nextReq = this._queue[0];
                let exec = false;
                if (Date.now() - this._lastRequestTime > this.apiDelayMillis) {
                    if (nextReq.tg === TelegramType.Recruitment) {
                        if (Date.now() - this._lastTgTime >
                            this.recruitTgDelayMillis)
                        {
                            exec = true;
                        }
                    } else if (nextReq.tg === TelegramType.NonRecruitment) {
                        if (Date.now() - this._lastTgTime >
                            this.nonRecruitTgDelayMillis)
                        {
                            exec = true;
                        }
                    } else {
                        exec = true;
                    }
                }

                if (exec) {
                    this._requestInProgress = true;
                    nextReq.func();
                    this._queue.shift();
                }
            }, 0);
        } else {
            this._interval = setInterval(() => {
                if (this._queue.length === 0
                    || this.blockExistingRequests)
                {
                    return;
                }

                let nextReq = this._queue.shift()!;
                nextReq.func();
            }, 0);
        }
    }

    /**
     * Requests XML data from the NationStates API.
     *
     * @param shards Shards to add to the NationStates API path.
     * @param shardParams Additional shard-specific parameters.
     * @param globalParams Additional URI-level parameters.
     * @param auth Authentication information for private shards.
     * @param disableCache If the request cache is enabled, disable it for
     *                     this request.
     *
     * @return A promise returning the data from the NationStates API.
     */
    private async xmlRequest(
        shards: string[],
        shardParams: { [paramName: string]: string },
        globalParams: { [paramName: string]: string },
        auth: Auth | undefined,
        disableCache: boolean): Promise<any>
    {
        let allParams = "";
        if (shards.length !== 0) {
            allParams += "q=";
            allParams += shards.sort()
                               .map(item => encodeURIComponent(item))
                               .join("+");
            for (const paramName in shardParams) {
                allParams += ";" + encodeURIComponent(paramName)
                             + "=" + encodeURIComponent(shardParams[paramName]);
            }
            allParams += "&";
        }

        const globalParamNames = Object.keys(globalParams).sort();
        for (const paramName of globalParamNames) {
            allParams += encodeURIComponent(paramName) + "="
                         + encodeURIComponent(globalParams[paramName])
                         + "&";
        }
        allParams += "v=" + API_VERSION;

        const uri = this.apiPath(allParams);

        if (this.cacheApiRequests && !disableCache) {
            if (this._cache.hasOwnProperty(uri)) {
                const entry = this._cache[uri];
                if ((Date.now() - entry.time) / 1000
                    < this.cacheTime)
                {
                    return clone(entry.data);
                }
            }
        }

        const response = await this.apiRequest(uri, undefined, auth);
        const json = await this.parseXml(response.text);

        if (this.cacheApiRequests)
        {
            this._cache[uri] =
                {
                    time: Date.now(),
                    data: json
                };
        }
        return json;
    }

    /**
     * Parses XML into a JSON object.
     *
     * @param text The XML to parse.
     * @return A promise returning a JSON object.
     */
    private parseXml(text: string): Promise<any> {
        return new Promise((resolve, reject) => {
            xmlParser.parseString(text, (err: any, data: any) => {
                if (err) {
                    return reject(err);
                }
                resolve(data);
            });
        });
    }

    /**
     * Creates a NationStates API path from a set of parameters.
     */
    private apiPath(params: string): string {
        let path = "/cgi-bin/api.cgi?userAgent="
                   + encodeURIComponent(this.userAgent);
        path += "&" + params;
        return path;
    }

    /**
     * Requests data from the NationStates API.
     *
     * @param path The NationStates API path to request data from.
     * @param tg The telegram type, or undefined if this is not a telegram
     *           request.
     * @param auth Authentication information for private shards.
     *
     * @return A promise returning the data from the NationStates API.
     */
    private apiRequest(
        path: string,
        tg: TelegramType | undefined,
        auth: Auth | undefined): Promise<HttpResponse>
    {
        return new Promise((resolve, reject) => {
            if (this.blockNewRequests) {
                throw new Error("Request blocked: blockNewRequests"
                                + " property is set to true");
            }
            if (this._cleanup) {
                throw new Error("Request blocked: cleanup function has"
                                + " been called and no further requests can be"
                                + " made using this API instance");
            }

            let headers: any = {
                "User-Agent": this.userAgent
            };
            if (auth) {
                if (auth.pin) {
                    headers["X-Pin"] = auth.pin;
                }
                if (auth.autologin) {
                    headers["X-Autologin"] = auth.autologin;
                }
                if (auth.password) {
                    headers["X-Password"] = auth.password;
                }
            }

            const func = () => {
                https.get(
                    {
                        protocol: "https:",
                        host: "www.nationstates.net",
                        path,
                        headers
                    },
                    (response: IncomingMessage) => {
                        let data = "";
                        response.on("data", (chunk: string) => {
                            data += chunk;
                        });
                        response.on("end", () => {
                            this._requestInProgress = false;
                            this._lastRequestTime = Date.now();
                            if (typeof tg !== "undefined") {
                                this._lastTgTime = this._lastRequestTime;
                            }

                            if (response.statusCode === 200) {
                                if (auth) {
                                    if (auth.updateAutologin
                                        && response.headers["x-autologin"])
                                    {
                                        let autologin =
                                            response.headers["x-autologin"];
                                        if (autologin instanceof Array) {
                                            autologin = autologin[0];
                                        }
                                        auth.autologin = autologin;
                                    }
                                    if (auth.updatePin
                                        && response.headers["x-pin"])
                                    {
                                        let pin =
                                            response.headers["x-pin"];
                                        if (pin instanceof Array) {
                                            pin = pin[0];
                                        }
                                        auth.pin = pin;
                                    }
                                }

                                resolve({metadata: response, text: data});
                            } else {
                                reject(new ApiError(
                                    `Request failed: API returned HTTP`
                                    + ` response code ${response.statusCode}`,
                                    response,
                                    data));
                            }
                        });
                    }
                ).on("error", reject);
            };
            this._queue.push({tg, func, reject});
        });
    }

    /**
     * Converts names to a fixed form: all lowercase, with spaces replaced
     * with underscores.
     *
     * @param name The name to convert.
     *
     * @return The converted name.
     */
    private static toId(name: string) {
        return name.replace("_", " ")
                   .trim()
                   .toLowerCase()
                   .replace(" ", "_");
    }
}
