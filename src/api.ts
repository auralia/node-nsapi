/**
 * Copyright (C) 2016 Auralia
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
import * as clone from "clone";
import {Promise} from "es6-promise";
import * as https from "https";
import * as xml2js from "xml2js";

const xmlParser = new xml2js.Parser(
    {
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
export const VERSION = "0.1.10";

/**
 * The version specified in API requests.
 */
export const API_VERSION = 9;

/**
 * The council specified in World Assembly API requests.
 */
export enum WorldAssemblyCouncil {
    GeneralAssembly = 1,
    SecurityCouncil = 2
}

/**
 * The telegram type for rate limit purposes. Recruitment telegrams have a
 * stricter rate limit than non-recruitment telegrams.
 */
export enum TelegramType {
    Recruitment,
    NonRecruitment
}

/**
 * Used to authenticate with the nation API in order to use private shards.
 * Private shards provide access to information that is only available to
 * logged-in nations.
 */
export interface PrivateShardsAuth {
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
     * The HTTP response code returned by the API.
     */
    public responseCode?: number;
    /**
     * The HTTP response text returned by the API.
     */
    public responseText?: string;

    /**
     * Initializes a new instance of the ApiError class.
     *
     * @param message The message associated with the error.
     * @param responseCode The HTTP response code returned by the API.
     * @param responseText The HTTP response text returned by the API.
     */
    constructor(message: string, responseCode?: number, responseText?: string) {
        super(message);
        this.message = message;
        this.responseCode = responseCode;
        this.responseText = responseText;
    }
}

/**
 * Provides access to the NationStates API.
 */
export class NsApi {
    private _userAgent: string;
    private _delay: boolean;
    private _apiDelayMillis: number;
    private _recruitTgDelayMillis: number;
    private _nonRecruitTgDelayMillis: number;

    private readonly _queue: {
        tg: TelegramType | undefined;
        func: () => void;
        reject: (err: any) => void;
    }[];
    private _interval: any;
    private _lastRequestTime: number;
    private _lastTgTime: number;
    private _requestInProgress: boolean;

    private _cacheApiRequests: boolean;
    private readonly _cache: {
        [url: string]: {
            time: number,
            data: any
        }
    };
    private _cacheTime: number;

    private _blockExistingRequests: boolean;
    private _blockNewRequests: boolean;
    private _cleanup: boolean;

    /**
     * Initializes a new instance of the NationStatesApi class.
     *
     * @param userAgent A string identifying you to the NationStates API.
     *                  Using the name of your main nation is recommended.
     * @param delay Whether a delay is introduced before API and telegram
     *              requests. Defaults to true.
     * @param apiDelayMillis The delay before API requests in milliseconds.
     *                       Defaults to 600.
     * @param nonRecruitTgDelayMillis The delay before non-recruitment
     *                                telegram requests in milliseconds.
     *                                Defaults to 60000.
     * @param recruitTgDelayMillis The delay before recruitment telegram
     *                             requests in milliseconds. Defaults to
     *                             180000.
     * @param cacheApiRequests Whether API requests should be cached.
     *                         Defaults to true.
     * @param cacheTime The number of seconds that API requests should stay
     *                  cached. Defaults to 900.
     * @param allowImmediateApiRequests Allows API requests immediately after
     *                                  the API is initialized.
     * @param allowImmediateTgRequests Allows telegram requests immediately
     *                                 after the API is initialized.
     */
    constructor(userAgent: string,
                delay: boolean = true,
                apiDelayMillis: number = 600,
                nonRecruitTgDelayMillis: number = 60000,
                recruitTgDelayMillis: number = 180000,
                cacheApiRequests: boolean = true,
                cacheTime: number = 900,
                allowImmediateApiRequests: boolean = true,
                allowImmediateTgRequests: boolean = true)
    {
        this.userAgent = userAgent;
        this.delay = delay;
        this.apiDelayMillis = apiDelayMillis;
        this.nonRecruitTgDelayMillis = nonRecruitTgDelayMillis;
        this.recruitTgDelayMillis = recruitTgDelayMillis;

        this._queue = [];
        if (allowImmediateApiRequests) {
            this._lastRequestTime = Date.now() - this.apiDelayMillis;
        } else {
            this._lastRequestTime = Date.now();
        }
        if (allowImmediateTgRequests) {
            this._lastTgTime = Date.now() - this.recruitTgDelayMillis;
        } else {
            this._lastTgTime = Date.now();
        }
        this._requestInProgress = false;

        this.initInterval();

        this._cache = {};
        this.cacheApiRequests = cacheApiRequests;
        this.cacheTime = cacheTime;

        this.blockExistingRequests = false;
        this.blockNewRequests = false;
        this._cleanup = false;
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
            throw new Error("A valid user agent must be defined in order to"
                            + " use the NationStates API");
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
            throw new RangeError("API delay must be greater than or equal to"
                                 + " 600");
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
            throw new RangeError("Non-recruitment telegram delay must be"
                                 + " greater than or equal to 60000");
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
            this._queue.pop()!.reject(new Error("API queue cleared"));
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
     * @param extraParams Additional shard-specific parameters.
     * @param auth Authentication information for private shards.
     * @param disableCache If the request cache is enabled, disable it for
     *                     this request.
     *
     * @return A promise providing data from the API.
     */
    public nationRequest(nation: string, shards: string[] = [],
                         extraParams: {[name: string]: string} = {},
                         auth?: PrivateShardsAuth,
                         disableCache: boolean = false): Promise<any>
    {
        return Promise.resolve().then(() => {
            extraParams["nation"] = NsApi.toId(nation);
            return this.xmlRequest(shards, extraParams, auth, disableCache);
        });
    }

    /**
     * Requests data from the NationStates region API.
     *
     * @param region The name of the region to request data for.
     * @param shards An array of region API shards. No shards will be specified
     *               if left undefined.
     * @param extraParams Additional shard-specific parameters.
     * @param disableCache If the request cache is enabled, disable it for
     *                     this request.
     *
     * @return A promise providing data from the API.
     */
    public regionRequest(region: string, shards: string[] = [],
                         extraParams: {[name: string]: string} = {},
                         disableCache: boolean = false): Promise<any>
    {
        return Promise.resolve().then(() => {
            extraParams["region"] = NsApi.toId(region);
            return this.xmlRequest(shards, extraParams, undefined,
                                   disableCache);
        });
    }

    /**
     * Requests data from the NationStates world API.
     *
     * @param shards An array of world API shards. No shards will be specified
     *               if left undefined.
     * @param extraParams Additional shard-specific parameters.
     * @param disableCache If the request cache is enabled, disable it for
     *                     this request.
     *
     * @return A promise providing data from the API.
     */
    public worldRequest(shards: string[] = [],
                        extraParams: {[name: string]: string} = {},
                        disableCache: boolean = false): Promise<any>
    {
        return this.xmlRequest(shards, extraParams, undefined, disableCache);
    }

    /**
     * Requests data from the NationStates World Assembly API.
     *
     * @param council The council of the World Assembly to request data for.
     * @param shards An array of World Assembly API shards. No shards will be
     *               specified if left undefined.
     * @param extraParams Additional shard-specific parameters.
     * @param disableCache If the request cache is enabled, disable it for
     *                     this request.
     *
     * @return A promise providing data from the API.
     */
    public worldAssemblyRequest(council: WorldAssemblyCouncil,
                                shards: string[] = [],
                                extraParams: {[name: string]: string} = {},
                                disableCache: boolean = false): Promise<any>
    {
        return Promise.resolve().then(() => {
            extraParams["wa"] = String(council);
            return this.xmlRequest(shards, extraParams, undefined,
                                   disableCache);
        });
    }

    /**
     * Sends a telegram using the NationStates telegram API.
     *
     * Note that telegram requests are never cached.
     *
     * @param clientKey The client key.
     * @param tgId The ID of the telegram API template.
     * @param tgSecretKey The secret key of the telegram API template.
     * @param recipient The name of the recipient.
     * @param type The telegram type for rate limit purposes.
     *
     * @return A promise providing confirmation from the telegram API.
     */
    public telegramRequest(clientKey: string, tgId: string,
                           tgSecretKey: string, recipient: string,
                           type: TelegramType): Promise<void>
    {
        return Promise.resolve().then(() => {
            let params = "a=sendTG";
            params += "&client=" + encodeURIComponent(clientKey);
            params += "&tgid=" + encodeURIComponent(tgId);
            params += "&key=" + encodeURIComponent(tgSecretKey);
            params += "&to=" + encodeURIComponent(NsApi.toId(recipient));

            return this.apiRequest(this.apiPath(params), type, undefined)
                       .then((data: string) => {
                           if (!(typeof data === "string"
                                 && data.trim().toLowerCase() === "queued"))
                           {
                               throw new ApiError(
                                   "telegram API response did not consist of"
                                   + " the string 'queued'", 200, data);
                           }
                       });
        });
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
    public authenticateRequest(nation: string, checksum: string,
                               token?: string): Promise<boolean>
    {
        return Promise.resolve().then(() => {
            let params = "a=verify";
            params += "&nation=" + encodeURIComponent(NsApi.toId(nation));
            params += "&checksum=" + encodeURIComponent(checksum);
            if (token) {
                params += "&token=" + encodeURIComponent(token);
            }

            return this.apiRequest(this.apiPath(params), undefined, undefined)
                       .then((data: string) => {
                           if (typeof data === "string"
                               && data.trim() === "1")
                           {
                               return true;
                           } else if (typeof data === "string"
                                      && data.trim() === "0")
                           {
                               return false;
                           } else {
                               throw new ApiError(
                                   "authentication API response did not consist"
                                   + " of the string '1' or '0'", 200, data);
                           }
                       });
        });
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
     * @param params Additional parameters to add to the NationStates API
     *               path.
     * @param auth Authentication information for private shards.
     * @param disableCache If the request cache is enabled, disable it for
     *                     this request.
     *
     * @return A promise returning the data from the NationStates API.
     */
    private xmlRequest(shards: string[], params: {[name: string]: string},
                       auth: PrivateShardsAuth | undefined,
                       disableCache: boolean): Promise<any>
    {
        return Promise.resolve().then(() => {
            let allParams = "";
            allParams += "q=" + shards.sort()
                                      .map(item => encodeURIComponent(item))
                                      .join("+") + "&";
            const paramKeys = Object.keys(params).sort();
            for (const param of paramKeys) {
                allParams += encodeURIComponent(param) + "="
                             + encodeURIComponent(params[param]) + "&";
            }
            allParams += "v=" + API_VERSION;

            const uri = this.apiPath(allParams);

            if (this.cacheApiRequests && !disableCache) {
                if (this._cache.hasOwnProperty(uri)) {
                    const entry = this._cache[uri];
                    if ((Date.now() - entry.time) / 1000
                        < this.cacheTime)
                    {
                        return Promise.resolve(clone(entry.data));
                    }
                }
            }

            return this.apiRequest(uri, undefined, auth)
                       .then((data: string) => {
                           return new Promise((resolve, reject) => {
                               xmlParser.parseString(data, (err: any,
                                                            data: any) => {
                                   if (err) {
                                       reject(err);
                                   }

                                   if (this.cacheApiRequests)
                                   {
                                       this._cache[uri] = {
                                           time: Date.now(),
                                           data
                                       };
                                   }

                                   resolve(data);
                               });
                           });
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
    private apiRequest(path: string, tg: TelegramType | undefined,
                       auth: PrivateShardsAuth | undefined): Promise<string>
    {
        return new Promise((resolve, reject) => {
            if (this.blockNewRequests) {
                throw new Error("New API requests are being blocked");
            }
            if (this._cleanup) {
                throw new Error("API is shut down");
            }

            let headers: any = {
                "User-Agent": this.userAgent
            };
            if (auth) {
                if (auth.pin) {
                    headers["Pin"] = auth.pin;
                }
                if (auth.autologin) {
                    headers["Autologin"] = auth.autologin;
                }
                if (auth.password) {
                    headers["Password"] = auth.password;
                }
            }

            const func = () => {
                https.get(
                    {
                        host: "www.nationstates.net",
                        path,
                        headers
                    },
                    res => {
                        let data = "";
                        res.on("data", chunk => {
                            data += chunk;
                        });
                        res.on("end", () => {
                            this._requestInProgress = false;
                            this._lastRequestTime = Date.now();
                            if (tg) {
                                this._lastTgTime = this._lastRequestTime;
                            }

                            if (res.statusCode === 200) {
                                if (auth) {
                                    if (auth.updateAutologin
                                        && res.headers["x-autologin"])
                                    {
                                        auth.autologin =
                                            res.headers["x-autologin"];
                                    }
                                    if (auth.updatePin
                                        && res.headers["x-pin"])
                                    {
                                        auth.pin =
                                            res.headers["x-pin"];
                                    }
                                }

                                resolve(clone(data));
                            } else {
                                reject(new ApiError(
                                    `API returned HTTP response code`
                                    + ` ${res.statusCode}`,
                                    res.statusCode,
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
        return name.replace("_", " ").trim().toLowerCase().replace(" ", "_");
    }
}
