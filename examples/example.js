/**
 * Copyright (C) 2016-2017 Auralia
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

const { NsApi, WorldAssemblyCouncil, TelegramType } = require("../lib/api.js");

/**
 * TODO: Replace the user agent with your own
 */
const api = new NsApi("Your nation's name");

/**
 * The following is a simple example that retrieves the nation Auralia's full
 * name and prints it to the console.
 */
function nationApiExample() {
    return api.nationRequest("Auralia", ["fullname"])
        .then(data => {
            console.log(data.fullname);
        });
}

/**
 * The following is the same example as example 1, but notice how it completes
 * much faster because the previous request was cached!
 */
function cacheExample() {
    return nationApiExample();
}

/**
 * The following example retrieves the delegate, founder, and list of nations
 * in the region of Catholic.
 */
function regionApiExample() {
    return api.regionRequest("Catholic", ["nations", "delegate", "founder"])
        .then(data => {
            console.log(`
Region of Catholic

Delegate: ${data.delegate}
Founder: ${data.founder}
Nations: ${data.ntaions.split(":")}
            `);
        });
}

// The following example retrieves the last 5 founding happening entries.
function worldApiExample() {
    return api.worldRequest(["happenings"],
        { filter: "founding", limit: "5" })
        .then(data => {
            for (const event of data.happenings.event) {
                console.log(`
Event ID: ${event.id}
Event Timestamp: ${event.timestamp}
Event Text: ${event.text}
                `);
            }
        });
}

// The following example retrieves information about the last Security Council
// resolution at vote.
function worldAssemblyApiExample() {
    return api.worldAssemblyRequest(WorldAssemblyCouncil.SecurityCouncil,
        ["lastresolution"])
        .then(data => {
            console.log(data.lastresolution);
        });
}

// The following is a complex example that retrieves and sorts the list of
// nations in the region of Catholic by their influence score, then prints the
// list to the console.
function complexExample() {
    return api.regionRequest("Catholic", ["nations"])
        .then(data => {
            const nations = data.nations.split(":");

            return Promise.all(nations.map(nation => {
                return api.nationRequest(
                    nation,
                    ["name", "censusscore-65"]
                ).then(data => {
                    console.log(`Retrieved information for ${data.name}`);
                    return {
                        nation: data.name,
                        influence: data.censusscore.value
                    };
                });
            }));
        })
        .then(influence => {
            influence.sort((a, b) => {
                return b.influence - a.influence;
            });

            console.log(`\n${rightpad("Nation", 50)} Influence"`);
            for (let i = 0; i < influence.length; i++) { // eslint-disable-line id-length
                console.log(`${rightpad(influence[i].nation, 50)} ${influence[i].influence}`);
            }
        });
    function rightpad(str, num) {
        const len = str.length;
        for (let id = 0; id < num - len; id++) {
            str += " ";
        }
        return str;
    }
}

function telegramExample() {
    /** Replace telegram details with your own */
    const clientKey = "";
    const telegramId = "";
    const telegramSecretKey = "";

    return api.telegramRequest(clientKey, telegramId, telegramSecretKey,
        "Auralia", TelegramType.NonRecruitment)
        .then(() => {
            console.log("Telegram sent");
        })
        .catch(err => {
            console.log("Telegram was not sent", err);
        });
}

function authenticationExample() {
    /** Replace nation name and checksum with your own */
    const nation = "";
    const checksum = "";

    return api.authenticateRequest(nation, checksum)
        .then(success => {
            if (success) {
                console.log("Authentication succeeded");
            } else {
                console.log("Authentication failed");
            }
        });
}

// The following example uses private shards to retrieve the next issue time
// and print it to the console, along with the PIN required for future private
// shard requests.
function privateShardsExample() {
    /** Replace the nation name and password with your own */
    const nationName = "";
    const nationPassword = "";

    const auth = {
        password: nationPassword,
        updatePin: true
    };
    return api.nationRequest(
        nationName,
        ["nextissuetime"],
        undefined,
        auth)
        .then(data => {
            console.log(`
Next issue time: ${data.nextissuetime}
PIN: ${auth.pin}
`);
        });
}

// The following code executes each example.
const functions = [
    console.log("Nation API Example"),
    nationApiExample(),
    console.log("Cache Example"),
    cacheExample(),
    console.log("Region API Example"),
    regionApiExample(),
    console.log("World API Example"),
    worldApiExample(),
    console.log("World Assembly API Example"),
    worldAssemblyApiExample(),
    console.log("Complex Example"),
    complexExample(),
    console.log("Telegram Example"),
    telegramExample(),
    console.log("Authentication Example"),
    authenticationExample(),
    console.log("Private Shards Example"),
    privateShardsExample()
];
Promise.all(functions)
    .then(() => {
        api.cleanup();
    });
