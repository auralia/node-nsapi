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

import * as http from "http";
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
 * The current version of node-nsapi.
 */
export const VERSION = "0.1.0";

/**
 * The API version specified in API requests.
 */
export const API_VERSION = 7;

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

export class Api {
    private _userAgent: string;
    private _delay: number;
    private _apiDelayMillis: number;
    private _recruitTgDelayMillis: number;
    private _nonRecruitTgDelayMillis: number;

    private _reqQueue: any[];
    private _reqLast: number;
    private _tgReqLast: number;
    private _reqInProgress: boolean;
    private _reqInterval: any;

    /**
     * Initializes a new instance of the Api class.
     *
     * @param userAgent The user agent specified in API requests.
     * @param delay Whether a delay is introduced before API and telegram
     *              requests. Defaults to true.
     * @param apiDelayMillis The delay before API requests in milliseconds.
     *                       Defaults to 600.
     * @param recruitTgDelayMillis The delay before recruitment telegrams in
     *                             milliseconds. Defaults to 60000.
     * @param nonRecruitTgDelayMillis The delay before non-recruitment
     *                                telegrams in milliseconds. Defaults to
     *                                180000.
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

        if (typeof apiDelayMillis !== "undefined") {
            if (apiDelayMillis < 600) {
                throw new RangeError("API delay must be an integer greater"
                                     + " than or equal to 600");
            }
            this._apiDelayMillis = apiDelayMillis;
        }

        if (typeof recruitTgDelayMillis !== "undefined") {
            if (recruitTgDelayMillis < 600)
            {
                throw new RangeError("Recruitment telegram delay must be"
                                     + " an integer greater than or equal"
                                     + " to 600");
            }
            this._recruitTgDelayMillis = recruitTgDelayMillis;
        }

        if (typeof nonRecruitTgDelayMillis !== "undefined") {
            if (nonRecruitTgDelayMillis < 600)
            {
                throw new RangeError("Non-recruitment telegram delay must be"
                                     + " an integer greater than or equal"
                                     + " to 600");
            }
            this._nonRecruitTgDelayMillis = nonRecruitTgDelayMillis;
        }

        this._reqQueue = [];
        this._reqLast = Date.now();
        this._tgReqLast = Date.now();
        this._reqInProgress = false;
        if (delay) {
            this._reqInterval = setInterval(() => {
                if (this._reqInProgress || this._reqQueue.length === 0) {
                    return;
                }

                let nextReq = this._reqQueue[0];
                let exec = false;
                if (Date.now() - this._reqLast > this._apiDelayMillis) {
                    if (nextReq.tg === TelegramType.Recruitment) {
                        if (Date.now() - this._tgReqLast >
                            this._recruitTgDelayMillis)
                        {
                            exec = true;
                        }
                    } else if (nextReq.tg === TelegramType.NonRecruitment) {
                        if (Date.now() - this._tgReqLast >
                            this._nonRecruitTgDelayMillis)
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
                if (this._reqQueue.length === 0) {
                    return;
                }

                let nextReq = this._reqQueue.shift();
                nextReq.func();
            }, 0);
        }
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
     * Requests data from the NationStates nation API.
     *
     * @param nation The name of the nation to request data for.
     * @param shards An array of nation API shards. No shards will be specified
     *               if left undefined.
     * @param callback A callback function providing data from the API.
     */
    public nationRequest(nation: string, shards: string[] = [],
                         callback: (err?: any, data?: any) => void): void
    {
        this.xmlRequest("nation=" + encodeURIComponent(nation), shards,
                        callback);
    }

    /**
     * Requests data from the NationStates region API.
     *
     * @param region The name of the region to request data for.
     * @param shards An array of region API shards. No shards will be specified
     *               if left undefined.
     * @param callback A callback function providing data from the API.
     */
    public regionRequest(region: string, shards: string[] = [],
                         callback: (err?: any, data?: any) => void): void
    {
        this.xmlRequest("region=" + encodeURIComponent(region), shards,
                        callback);
    }

    /**
     * Requests data from the NationStates world API.
     *
     * @param shards An array of world API shards. No shards will be specified
     *               if left undefined.
     * @param callback A callback function providing data from the API.
     */
    public worldRequest(shards: string[] = [],
                        callback: (err?: any, data?: any) => void): void
    {
        this.xmlRequest("", shards, callback);
    }

    /**
     * Requests data from the NationStates World Assembly API.
     *
     * @param council The council of the World Assembly to request data for.
     * @param shards An array of World Assembly API shards. No shards will be
     *               specified if left undefined.
     * @param callback A callback function providing data from the API.
     */
    public worldAssemblyRequest(council: WorldAssemblyCouncil,
                                shards: string[] = [],
                                callback: (err?: any, data?: any) => void): void
    {
        this.xmlRequest("wa=" + council, shards, callback);
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
     * @param callback A callback function providing confirmation from the API.
     */
    public telegramRequest(clientKey: string, tgId: string, tgKey: string,
                           recipient: string, type: TelegramType,
                           callback: (err?: any) => void): void
    {
        let params = "a=sendTG";
        params += "&client=" + encodeURIComponent(clientKey);
        params += "&tgid=" + encodeURIComponent(tgId);
        params += "&key=" + encodeURIComponent(tgKey);
        params += "&to=" + encodeURIComponent(recipient);

        this.apiRequest(this.apiPath(params), type, (err, data) => {
            if (err) {
                callback(err);
            }
            if (typeof data === "string"
                && data.trim().toLowerCase() === "queued")
            {
                callback(undefined);
            } else {
                callback(new Error("telegram API response did not consist of" +
                                   " the string 'queued'"));
            }
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
     * @param callback A callback function providing confirmation from the API.
     *                 The boolean argument will be true if authenticated,
     *                 false if not authenticated, or undefined if an error
     *                 occurred.
     */
    public authenticateRequest(nation: string, checksum: string,
                               token: string | undefined,
                               callback: (err?: Error,
                                          authenticated?: boolean) => void)
    {
        let params = "a=verify";
        params += "&nation=" + encodeURIComponent(nation);
        params += "&checksum=" + encodeURIComponent(checksum);
        if (token) {
            params += "&token=" + encodeURIComponent(token);
        }

        this.apiRequest(this.apiPath(params), null, (err, data) => {
            if (err) {
                callback(err);
            }
            if (typeof data === "string" && data.trim() === "1") {
                callback(undefined, true);
            } else if (typeof data === "string" && data.trim() === "0") {
                callback(undefined, false);
            } else {
                callback(new Error("authentication API response did not" +
                                   " consist of the string '1' or '0'"));
            }
        });
    }

    /**
     * Cleans up the API after use. After this function is called, no further
     * requests can be made using this API instance.
     */
    public cleanup() {
        clearInterval(this._reqInterval);
    }

    /**
     * Creates a NationStates API path from a set of parameters.
     *
     * @param params The parameters to add to the path.
     *
     * @returns A NationStates API path.
     */
    private apiPath(params: string): string {
        let path = "/cgi-bin/api.cgi?";
        path += params;
        path += "&userAgent=" + encodeURIComponent(this.userAgent);
        return path;
    }

    /**
     * Requests data from the NationStates API.
     *
     * @param path The NationStates API path to request data from.
     * @param tg The telegram type, or null if this is not a telegram request.
     * @param callback A callback function providing data from the API.
     */
    private apiRequest(path: string, tg: TelegramType | null,
                       callback: (err?: Error, data?: string) => void): void
    {
        this._reqQueue.push(
            {
                tg: tg,
                func: () => {
                    http.get(
                        {
                            host: "www.nationstates.net",
                            path: path,
                            headers: {
                                "User-Agent": this.userAgent
                            }
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
                                    callback(undefined, data);
                                } else {
                                    callback(new Error(
                                        `API returned HTTP response code`
                                        + `${res.statusCode}`));
                                }
                            });
                        }
                    ).on("error", callback);
                }
            }
        );
    }

    /**
     * Requests XML data from the NationStates API.
     *
     * @param params Additional parameters to add to the NationStates API path.
     * @param shards Shards to add to the NationStates API path.
     * @param callback A callback function providing data from the API.
     */
    private xmlRequest(params: string, shards: string[],
                       callback: (err?: any, data?: any) => void): void
    {
        let allParams = "";
        allParams += params + "&";
        allParams +=
            "q=" + shards.map(item => encodeURIComponent(item)).join("+");
        allParams += "&v=" + API_VERSION;

        this.apiRequest(this.apiPath(allParams), null, (err, data) => {
            if (err) {
                callback(err);
            }
            xmlParser.parseString(data, callback);
        });
    }
}
