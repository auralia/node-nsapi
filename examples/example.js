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

var nsapi = require("../lib/api.js");

// TODO: Replace the user agent with your own
var api = new nsapi.NsApi("Your nation's name");

// The following is a simple example that retrieves the nation Auralia's full
// name and prints it to the console.
function nationApiExample() {
    return api.nationRequest("Auralia", ["fullname"])
        .then(function(data) {
            console.log(data["fullname"]);
        });
}

// The following is the same example as example 1, but notice how it completes
// much faster because the previous request was cached!
function cacheExample() {
    return nationApiExample();
}

// The following example retrieves the delegate, founder, and list of nations
// in the region of Catholic.
function regionApiExample() {
    return api.regionRequest("Catholic", ["nations", "delegate", "founder"])
        .then(function(data) {
            console.log("Region of Catholic");
            console.log();
            console.log("Delegate: " + data["delegate"]);
            console.log("Founder: " + data["founder"]);
            console.log("Nations: " + data["nations"].split(":"));
        });
}

// The following example retrieves the last 5 founding happening entries.
function worldApiExample() {
    return api.worldRequest(["happenings"],
        { filter: "founding", limit: "5" })
        .then(function(data) {
            for (var i = 0; i < data["happenings"]["event"].length; i++) {
                var event = data["happenings"]["event"][i];
                console.log();
                console.log("Event ID: " + event["id"]);
                console.log("Event Timestamp: " + event["timestamp"]);
                console.log("Event Text: " + event["text"]);
            }
        });
}

// The following example retrieves information about the last Security Council
// resolution at vote.
function worldAssemblyApiExample() {
    return api.worldAssemblyRequest(nsapi.WorldAssemblyCouncil.SecurityCouncil,
        ["lastresolution"])
        .then(function(data) {
            console.log(data["lastresolution"]);
        });
}

// The following is a complex example that retrieves and sorts the list of
// nations in the region of Catholic by their influence score, then prints the
// list to the console.
function complexExample() {
    return api.regionRequest("Catholic", ["nations"])
        .then(function(data) {
            var nations = data["nations"].split(":");

            return Promise.all(nations.map(function(nation) {
                return api.nationRequest(
                    nation,
                    ["name", "censusscore-65"]
                ).then(function(data) {
                    console.log(
                        "Retrieved information for " + data["name"]
                              + ".");
                    return {
                        nation: data["name"],
                        influence: data["censusscore"]["value"]
                    };
                });
            }));
        })
        .then(function(influence) {
            influence.sort(function(a, b) {
                return b["influence"] - a["influence"];
            });

            console.log("\n" + rightpad("Nation", 50) + " Influence");
            for (var i = 0; i < influence.length; i++) {
                console.log(rightpad(influence[i].nation, 50) + " "
                                  + influence[i].influence);
            }
        });

    function rightpad(str, num) {
        var len = str.length;
        for (var i = 0; i < num - len; i++) {
            str += " ";
        }
        return str;
    }
}

function telegramExample() {
    // TODO: Replace telegram details with your own
    var clientKey = "";
    var telegramId = "";
    var telegramSecretKey = "";

    return api.telegramRequest(clientKey, telegramId, telegramSecretKey,
        "Auralia", nsapi.TelegramType.NonRecruitment)
        .then(function() {
            console.log("Telegram sent");
        })
        .catch(function(err) {
            console.error("Telegram was not sent: ", err);
        });
}

function authenticationExample() {
    // TODO: Replace nation name and checksum with your own
    var nation = "";
    var checksum = "";

    return api.authenticateRequest(nation, checksum)
        .then(function(success) {
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
    // TODO: Replace the nation name and password with your own
    var nationName = "";
    var nationPassword = "";

    var auth = {
        password: nationPassword,
        updatePin: true
    };
    return api.nationRequest(
        nationName,
        ["nextissuetime"],
        undefined,
        auth)
        .then(function(data) {
            console.log("Next issue time: " + data["nextissuetime"]);
            console.log("PIN: " + auth.pin);
        });
}

// The following code executes each example.
Promise.resolve()
    .then(function() {
        console.log("Nation API example:\n");
        return nationApiExample();
    })
    .then(function() {
        console.log("\nCache example:\n");
        return cacheExample();
    })
    .then(function() {
        console.log("\nRegion API example:\n");
        return regionApiExample();
    })
    .then(function() {
        console.log("\nWorld API example:");
        return worldApiExample();
    })
    .then(function() {
        console.log("\nWorld Assembly API example:\n");
        return worldAssemblyApiExample();
    })
    .then(function() {
        console.log("\nComplex example:\n");
        return complexExample();
    })
    .then(function() {
        console.log("\nTelegram example:\n");
        return telegramExample();
    })
    .then(function() {
        console.log("\nAuthentication example:\n");
        return authenticationExample();
    })
    .then(function() {
        console.log("\nPrivate shards example:\n");
        return privateShardsExample();
    })
    .catch(function(err) {
        console.error(err);
    })
    .then(function() {
        api.cleanup();
    });
