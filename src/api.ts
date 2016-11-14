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

import * as https from "https";
const xml2js = require("xml2js");

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
export const VERSION = "0.1.4";

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
    Recruitment = 1,
        /**
         * A telegram that is not for the purposes of recruitment.
         */
    NonRecruitment = 2
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
     * Updates the value of pin with the value of the X-PIN header the first
     * time this object is used in a request.
     */
    updatePin?: boolean;
    /**
     * The autologin value to be used in authentication requests.
     */
    autologin?: string;
    /**
     * Updates the value of autologin with the value of the X-Autologin header
     * the first time this object is used in a request.
     */
    updateAutologin?: boolean;
}

/**
 * Information associated with a particular API request.
 */
interface ApiRequest {
    /**
     * The telegram type of the telegram request, or null if this is not a
     * telegram request.
     */
    tg: TelegramType | null;
    /**
     * The function to call to make the request.
     */
    func: () => void;
    /**
     * The function to call to cancel the request.
     */
    reject: (err: any) => void;
}

export class NationStatesApi {
    private readonly _userAgent: string;
    private readonly _delay: boolean;
    private readonly _apiDelayMillis: number;
    private readonly _recruitTgDelayMillis: number;
    private readonly _nonRecruitTgDelayMillis: number;

    private readonly _reqQueue: ApiRequest[];
    private readonly _reqInterval: any;
    private _reqLast: number;
    private _tgReqLast: number;
    private _reqInProgress: boolean;

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
     */
    constructor(userAgent: string,
                delay: boolean = true,
                apiDelayMillis: number = 600,
                nonRecruitTgDelayMillis: number = 60000,
                recruitTgDelayMillis: number = 180000)
    {
        if (typeof userAgent !== "string") {
            throw new Error("A valid user agent must be defined in order to"
                            + " use the NationStates API");
        }
        this._userAgent = `node-nsapi ${VERSION} (maintained by Auralia,`
                          + ` currently used by "${userAgent}")`;

        this._delay = delay;

        if (typeof apiDelayMillis !== "undefined") {
            if (apiDelayMillis < 600) {
                throw new RangeError("API delay must be an integer greater"
                                     + " than or equal to 600");
            }
            this._apiDelayMillis = apiDelayMillis;
        }

        if (typeof recruitTgDelayMillis !== "undefined") {
            if (recruitTgDelayMillis < 60000)
            {
                throw new RangeError("Recruitment telegram delay must be"
                                     + " an integer greater than or equal"
                                     + " to 60000");
            }
            this._recruitTgDelayMillis = recruitTgDelayMillis;
        }

        if (typeof nonRecruitTgDelayMillis !== "undefined") {
            if (nonRecruitTgDelayMillis < 180000)
            {
                throw new RangeError("Non-recruitment telegram delay must be"
                                     + " an integer greater than or equal"
                                     + " to 180000");
            }
            this._nonRecruitTgDelayMillis = nonRecruitTgDelayMillis;
        }

        this._reqQueue = [];
        this._reqLast = Date.now();
        this._tgReqLast = Date.now();
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

        this._blockExistingRequests = false;
        this._blockNewRequests = false;
        this._cleanup = false;
    }

    /**
     * Gets the user agent specified in API requests.
     */
    get userAgent() {
        return this._userAgent;
    }

    /**
     * Gets a value indicating whether a delay is introduced before API and
     * telegram requests.
     */
    get delay() {
        return this._delay;
    }

    /**
     * Gets the delay before API requests in milliseconds.
     */
    get apiDelayMillis() {
        return this._apiDelayMillis;
    }

    /**
     * Gets the delay before non-recruitment telegrams in milliseconds.
     */
    get nonRecruitTgDelayMillis() {
        return this._nonRecruitTgDelayMillis;
    }

    /**
     * Gets the delay before recruitment telegrams in milliseconds.
     */
    get recruitTgDelayMillis() {
        return this._recruitTgDelayMillis;
    }

    /**
     * Gets whether or not existing requests in the queue are blocked from being
     * performed.
     */
    get blockExistingRequests() {
        return this._blockExistingRequests;
    }

    /**
     * If set to true, blocks the API from performing any further requests. If
     * set to false, normal operation will resume.
     *
     * @param blockExistingRequests Whether or not existing requests in the
     *                              queue should be blocked from being
     *                              performed.
     */
    set blockExistingRequests(blockExistingRequests: boolean) {
        this._blockExistingRequests = blockExistingRequests;
    }

    /**
     * Gets whether or not new requests are blocked from being added to the
     * queue.
     */
    get blockNewRequests() {
        return this._blockNewRequests;
    }

    /**
     * If set to true, prevents any new requests from being added to the queue.
     * If set to false, normal operation will resume.
     *
     * @param blockNewRequests Whether or not new requests should be blocked
     *                         from being added to the queue.
     */
    set blockNewRequests(blockNewRequests: boolean) {
        this._blockNewRequests = blockNewRequests;
    }

    /**
     * Gets whether or not an API request is in progress.
     */
    get reqInProgress() {
        return this._reqInProgress;
    }

    /**
     * Gets whether or not API requests are queued.
     */
    get reqQueued() {
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
     *
     * @return A promise providing data from the API.
     */
    public nationRequest(nation: string, shards: string[] = [],
                         extraParams: {[name: string]: string} = {},
                         auth?: PrivateShardsAuth): Promise<any>
    {
        return Promise.resolve().then(() => {
            extraParams["nation"] = nation;
            return this.xmlRequest(shards, extraParams, auth);
        });
    }

    /**
     * Requests data from the NationStates region API.
     *
     * @param region The name of the region to request data for.
     * @param shards An array of region API shards. No shards will be specified
     *               if left undefined.
     * @param extraParams Additional shard-specific parameters.
     *
     * @return A promise providing data from the API.
     */
    public regionRequest(region: string, shards: string[] = [],
                         extraParams: {[name: string]: string} = {}): Promise<any>
    {
        return Promise.resolve().then(() => {
            extraParams["region"] = region;
            return this.xmlRequest(shards, extraParams);
        });
    }

    /**
     * Requests data from the NationStates world API.
     *
     * @param shards An array of world API shards. No shards will be specified
     *               if left undefined.
     * @param extraParams Additional shard-specific parameters.
     *
     * @return A promise providing data from the API.
     */
    public worldRequest(shards: string[] = [],
                        extraParams: {[name: string]: string} = {}): Promise<any>
    {
        return this.xmlRequest(shards, extraParams);
    }

    /**
     * Requests data from the NationStates World Assembly API.
     *
     * @param council The council of the World Assembly to request data for.
     * @param shards An array of World Assembly API shards. No shards will be
     *               specified if left undefined.
     * @param extraParams Additional shard-specific parameters.
     *
     * @return A promise providing data from the API.
     */
    public worldAssemblyRequest(council: WorldAssemblyCouncil,
                                shards: string[] = [],
                                extraParams: {[name: string]: string} = {}): Promise<any>
    {
        return Promise.resolve().then(() => {
            extraParams["wa"] = String(council);
            return this.xmlRequest(shards, extraParams);
        });
    }

    /**
     * Sends a telegram using the NationStates telegram API.
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
            params += "&to=" + encodeURIComponent(recipient);

            return this.apiRequest(this.apiPath(params), type)
                       .then((data: string) => {
                           if (!(typeof data === "string"
                                 && data.trim().toLowerCase() === "queued"))
                           {
                               throw new Error("telegram API response did not"
                                               + " consist of the string"
                                               + " 'queued'");
                           }
                       });
        });
    }

    /**
     * Sends an authentication request using the NationStates authentication
     * API.
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
                               token: string | undefined): Promise<boolean>
    {
        return Promise.resolve().then(() => {
            let params = "a=verify";
            params += "&nation=" + encodeURIComponent(nation);
            params += "&checksum=" + encodeURIComponent(checksum);
            if (token) {
                params += "&token=" + encodeURIComponent(token);
            }

            return this.apiRequest(this.apiPath(params), null)
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
                               throw new Error("authentication API response did"
                                               + " not consist of the string"
                                               + " '1' or '0'");
                           }
                       });
        });
    }

    /**
     * Creates a NationStates API path from a set of parameters.
     *
     * @param params The parameters to add to the path.
     *
     * @return A NationStates API path.
     */
    private apiPath(params: string): string {
        let path = "/cgi-bin/api.cgi?";
        path += params;
        path += "&userAgent=" + encodeURIComponent(this.userAgent);
        return path;
    }

    /**
     * Requests XML data from the NationStates API.
     *
     * @param shards Shards to add to the NationStates API path.
     * @param params Additional parameters to add to the NationStates API
     *               path.
     * @param auth Authentication information for private shards.
     *
     * @return A promise returning the data from the NationStates API.
     */
    private xmlRequest(shards: string[], params: {[name: string]: string},
                       auth?: PrivateShardsAuth): Promise<any>
    {
        return Promise.resolve().then(() => {
            let allParams = "";
            allParams += "q=" + shards.map(item => encodeURIComponent(item))
                                      .join("+") + "&";
            for (const param in params) {
                if (params.hasOwnProperty(param)) {
                    allParams += encodeURIComponent(param) + "="
                                 + encodeURIComponent(params[param]) + "&";
                }
            }
            allParams += "v=" + API_VERSION;

            return this.apiRequest(this.apiPath(allParams), null, auth)
                       .then((data: string) => {
                           return new Promise((resolve, reject) => {
                               xmlParser.parseString(data, (err: any,
                                                            data: any) => {
                                   if (err) {
                                       reject(err);
                                   }
                                   resolve(data);
                               });
                           });
                       });
        });
    }

    /**
     * Requests data from the NationStates API.
     *
     * @param path The NationStates API path to request data from.
     * @param tg The telegram type, or null if this is not a telegram request.
     * @param auth Authentication information for private shards.
     *
     * @return A promise returning the data from the NationStates API.
     */
    private apiRequest(path: string, tg: TelegramType | null,
                       auth?: PrivateShardsAuth): Promise<string>
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

                                resolve(data);
                            } else {
                                reject(new Error(
                                    `API returned HTTP response code`
                                    + ` ${res.statusCode}`));
                            }
                        });
                    }
                ).on("error", reject);
            };
            this._reqQueue.push({tg, func, reject});
        });
    }
}
