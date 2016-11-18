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
 * The current version of nsapi.
 */
export const VERSION = "0.1.8";

/**
 * The API version specified in API requests.
 */
export const API_VERSION = 9;

/**
 * The council of the World Assembly to be specified in World Assembly API
 * requests.
 */
export enum WorldAssemblyCouncil {
    /**
     * The General Assembly.
     */
    GeneralAssembly = 1,
        /**
         * The Security Council.
         */
    SecurityCouncil = 2
}

/**
 * The telegram type specified for the purposes of rate limitation.
 */
export enum TelegramType {
    /**
     * A telegram that is for the purposes of recruitment.
     */
    Recruitment,
        /**
         * A telegram that is not for the purposes of recruitment.
         */
    NonRecruitment
}

/**
 * Information used to authenticate with the NationStates nation API in order
 * to use private shards.
 */
export interface PrivateShardsAuth {
    /**
     * The password of the nation specified in the request.
     */
    password?: string;
    /**
     * The PIN to be used in authentication requests.
     */
    pin?: string;
    /**
     * If true, updates the value of pin with the value of the X-PIN header
     * the first time this object is used in a request.
     */
    updatePin?: boolean;
    /**
     * The autologin value to be used in authentication requests.
     */
    autologin?: string;
    /**
     * If true, updates the value of autologin with the value of the
     * X-Autologin header the first time this object is used in a request.
     */
    updateAutologin?: boolean;
}

/**
 * Error thrown during API requests.
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
 * Represents a request cache.
 */
interface Cache {
    /**
     * Maps a URI to a cache entry, which consists of a number and any cached
     * data.
     */
    [url: string]: {time: number, data: any}
}

/**
 * Information associated with a particular API request.
 */
interface ApiRequest {
    /**
     * The telegram type of the telegram request, or null if this is not a
     * telegram request.
     */
    tg: TelegramType | undefined;
    /**
     * The function to call to make the request.
     */
    func: () => void;
    /**
     * The function to call to cancel the request.
     */
    reject: (err: any) => void;
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

    private readonly _reqQueue: ApiRequest[];
    private readonly _reqInterval: any;
    private _reqLast: number;
    private _tgReqLast: number;
    private _reqInProgress: boolean;

    private readonly _reqCache: Cache;
    private _reqCacheEnabled: boolean;
    private _reqCacheValiditySecs: number;

    private _blockExistingRequests: boolean;
    private _blockNewRequests: boolean;
    private _cleanup: boolean;

    /**
     * Initializes a new instance of the NationStatesApi class.
     *
     * @param userAgent The user agent specified in API requests.
     * @param delay Whether a delay is introduced before API and telegram
     *              requests. Defaults to true.
     * @param apiDelayMillis The delay before API requests in milliseconds.
     *                       Defaults to 600.
     * @param nonRecruitTgDelayMillis The delay before non-recruitment
     *                                telegrams in milliseconds. Defaults to
     *                                60000.
     * @param recruitTgDelayMillis The delay before recruitment telegrams in
     *                             milliseconds. Defaults to 180000.
     * @param requestCacheEnabled Whether or not certain API requests
     *                            should be temporarily cached. Defaults to
     *                            true.
     * @param requestCacheValiditySecs The number of seconds that a request
     *                                 should stay cached. Defaults to 900.
     * @param allowImmediateRequests Allows API requests immediately after the
     *                               API is initialized without delay.
     * @param allowImmediateTgRequests Allows telegram requests immediately
     *                                 after the API is initialized without
     *                                 delay.
     */
    constructor(userAgent: string,
                delay: boolean = true,
                apiDelayMillis: number = 600,
                nonRecruitTgDelayMillis: number = 60000,
                recruitTgDelayMillis: number = 180000,
                requestCacheEnabled: boolean = true,
                requestCacheValiditySecs: number = 900,
                allowImmediateRequests: boolean = true,
                allowImmediateTgRequests: boolean = true)
    {
        this.userAgent = userAgent;
        this.delay = delay;
        this.apiDelayMillis = apiDelayMillis;
        this.nonRecruitTgDelayMillis = nonRecruitTgDelayMillis;
        this.recruitTgDelayMillis = recruitTgDelayMillis;

        this._reqQueue = [];
        if (allowImmediateRequests) {
            this._reqLast = Date.now() - this.apiDelayMillis;
        } else {
            this._reqLast = Date.now();
        }
        if (allowImmediateTgRequests) {
            this._tgReqLast = Date.now() - this.recruitTgDelayMillis;
        } else {
            this._tgReqLast = Date.now();
        }
        this._reqInProgress = false;
        if (this.delay) {
            this._reqInterval = setInterval(() => {
                if (this.reqInProgress
                    || this._reqQueue.length === 0
                    || this.blockExistingRequests)
                {
                    return;
                }

                let nextReq = this._reqQueue[0];
                let exec = false;
                if (Date.now() - this._reqLast > this.apiDelayMillis) {
                    if (nextReq.tg === TelegramType.Recruitment) {
                        if (Date.now() - this._tgReqLast >
                            this.recruitTgDelayMillis)
                        {
                            exec = true;
                        }
                    } else if (nextReq.tg === TelegramType.NonRecruitment) {
                        if (Date.now() - this._tgReqLast >
                            this.nonRecruitTgDelayMillis)
                        {
                            exec = true;
                        }
                    } else {
                        exec = true;
                    }
                }

                if (exec) {
                    this._reqInProgress = true;
                    nextReq.func();
                    this._reqQueue.shift();
                }
            }, 0);
        } else {
            this._reqInterval = setInterval(() => {
                if (this._reqQueue.length === 0
                    || this.blockExistingRequests)
                {
                    return;
                }

                let nextReq = this._reqQueue.shift()!;
                nextReq.func();
            }, 0);
        }

        this._reqCache = {};
        this.requestCacheEnabled = requestCacheEnabled;
        this.requestCacheValiditySecs = requestCacheValiditySecs;

        this.blockExistingRequests = false;
        this.blockNewRequests = false;
        this._cleanup = false;
    }

    /**
     * Gets the user agent specified in API requests.
     */
    public get userAgent() {
        return this._userAgent;
    }

    /**
     * Sets the user agent specified in API requests.
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
     * Gets a value indicating whether a delay is introduced before API and
     * telegram requests.
     */
    public get delay() {
        return this._delay;
    }

    /**
     * Sets a value indicating whether a delay is introduced before API and
     * telegram requests.
     */
    public set delay(delay: boolean) {
        this._delay = delay;
    }

    /**
     * Gets the delay before API requests in milliseconds.
     */
    public get apiDelayMillis() {
        return this._apiDelayMillis;
    }

    /**
     * Sets the delay before API requests in milliseconds.
     */
    public set apiDelayMillis(apiDelayMillis: number) {
        if (apiDelayMillis < 600) {
            throw new RangeError("API delay must be greater han or equal to"
                                 + " 600");
        }
        this._apiDelayMillis = apiDelayMillis;
    }

    /**
     * Gets the delay before non-recruitment telegrams in milliseconds.
     */
    public get nonRecruitTgDelayMillis() {
        return this._nonRecruitTgDelayMillis;
    }

    /**
     * Sets the delay before non-recruitment telegrams in milliseconds.
     */
    public set nonRecruitTgDelayMillis(nonRecruitTgDelayMillis: number) {
        if (nonRecruitTgDelayMillis < 60000)
        {
            throw new RangeError("Non-recruitment telegram delay must be"
                                 + " an integer greater than or equal"
                                 + " to 60000");
        }
        this._nonRecruitTgDelayMillis = nonRecruitTgDelayMillis;
    }

    /**
     * Gets the delay before recruitment telegrams in milliseconds.
     */
    public get recruitTgDelayMillis() {
        return this._recruitTgDelayMillis;
    }

    /**
     * Sets the delay before recruitment telegrams in milliseconds.
     */
    public set recruitTgDelayMillis(recruitTgDelayMillis: number) {
        if (recruitTgDelayMillis < 180000)
        {
            throw new RangeError("Recruitment telegram delay must be"
                                 + " an integer greater than or equal"
                                 + " to 180000");
        }
        this._recruitTgDelayMillis = recruitTgDelayMillis;
    }

    /**
     * Gets whether or not existing requests in the queue are blocked from being
     * performed.
     */
    public get blockExistingRequests() {
        return this._blockExistingRequests;
    }

    /**
     * If set to true, blocks the API from performing any further requests. If
     * set to false, normal operation will resume.
     */
    public set blockExistingRequests(blockExistingRequests: boolean) {
        this._blockExistingRequests = blockExistingRequests;
    }

    /**
     * Gets whether or not new requests are blocked from being added to the
     * queue.
     */
    public get blockNewRequests() {
        return this._blockNewRequests;
    }

    /**
     * If set to true, prevents any new requests from being added to the queue.
     * If set to false, normal operation will resume.
     */
    public set blockNewRequests(blockNewRequests: boolean) {
        this._blockNewRequests = blockNewRequests;
    }

    /**
     * Gets whether or not an API request is in progress.
     */
    public get reqInProgress() {
        return this._reqInProgress;
    }

    /**
     * Gets whether or not API requests are queued.
     */
    public get reqQueued() {
        return this._reqQueue.length !== 0;
    }

    /**
     * Cancels all requests in the API queue.
     */
    public clearQueue(): void {
        while (this._reqQueue.length > 0) {
            this._reqQueue.pop()!.reject(new Error("API queue cleared"));
        }
    }

    /**
     * Gets whether the URI-based API request cache is enabled.
     */
    public get requestCacheEnabled() {
        return this._reqCacheEnabled;
    }

    /**
     * Sets whether the URI-based API request cache is enabled.
     */
    public set requestCacheEnabled(requestCacheEnabled: boolean) {
        this._reqCacheEnabled = requestCacheEnabled;
    }

    /**
     * Gets the number of seconds that entries in the request cache remain
     * valid.
     */
    public get requestCacheValiditySecs() {
        return this._reqCacheValiditySecs;
    }

    /**
     * Gets the number of seconds that entries in the request cache remain
     * valid. A value of 0 means that requests do not expire.
     */
    public set requestCacheValiditySecs(requestCacheValiditySecs: number) {
        if (requestCacheValiditySecs < 0)
        {
            throw new RangeError("Request cache validity must be at least 0");
        }
        this._reqCacheValiditySecs = requestCacheValiditySecs;
    }

    /**
     * Clears the request cache.
     */
    public clearRequestCache(): void {
        for (const uri in this._reqCache) {
            if (this._reqCache.hasOwnProperty(uri)) {
                delete this._reqCache[uri];
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
        clearInterval(this._reqInterval);
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
     * @param tgKey The secret key of the telegram API template.
     * @param recipient The name of the recipient.
     * @param type The type of the telegram as given by TelegramType,
     *             used for rate limit purposes.
     *
     * @return A promise providing confirmation from the telegram API.
     */
    public telegramRequest(clientKey: string, tgId: string,
                           tgKey: string, recipient: string,
                           type: TelegramType): Promise<void>
    {
        return Promise.resolve().then(() => {
            let params = "a=sendTG";
            params += "&client=" + encodeURIComponent(clientKey);
            params += "&tgid=" + encodeURIComponent(tgId);
            params += "&key=" + encodeURIComponent(tgKey);
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

            if (this.requestCacheEnabled && !disableCache) {
                if (this._reqCache.hasOwnProperty(uri)) {
                    const entry = this._reqCache[uri];
                    if ((Date.now() - entry.time) / 1000
                        < this.requestCacheValiditySecs)
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

                                   if (this.requestCacheEnabled)
                                   {
                                       this._reqCache[uri] = {
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
                            this._reqInProgress = false;
                            this._reqLast = Date.now();
                            if (tg) {
                                this._tgReqLast = this._reqLast;
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
            this._reqQueue.push({tg, func, reject});
        });
    }

    /**
     * Converts names to a fixed form: all lowercase, with spaces replaced
     * with underscores.
     */
    private static toId(name: string) {
        return name.replace("_", " ").trim().toLowerCase().replace(" ", "_");
    }
}
