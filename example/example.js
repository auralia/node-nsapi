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

var nsapi = require("../lib/api.js");

// Create main API object
var api = new nsapi.Api("Example user agent");

// The following is a simple example that retrieves a nation's full name and
// prints it to the console.
function simpleExample(callback) {
    // Retrieve "fullname" shard from the nation API for nation "Auralia"
    api.nationRequest("Auralia", ["fullname"], function(err, data) {
        // Throw error if one occurred
        if (err) {
            throw err;
        }

        // Print the nation's full name
        console.log(data.fullname);
        callback();
    });
}

// The following is a more complex example that retrieves and sorts a list of
// nations in a region by their influence score, then prints the list to the
// console.
function complexExample(callback) {
    getRegion(function(err, data) {
        if (err) {
            throw err;
        }
        getInfluence(data, function(err, influence) {
            if (err) {
                throw err;
            }
            printResults(influence, callback);
        });
    });

    function getRegion(callback) {
        api.regionRequest("Catholic", ["nations"], callback);
    }

    function getInfluence(data, callback) {
        var nations = data.nations.split(":");
        var influence = [];
        for (var i = 0; i < nations.length; i++) {
            var nation = nations[i];
            api.nationRequest(
                nation,
                ["name", "censusscore-65"],
                function(err, data) {
                    if (err) {
                        check(err);
                    }

                    influence.push(
                        {
                            nation: data.name,
                            influence: data.censusscore.value
                        });
                    console.log("Retrieved information for " + data.name + ".");
                    check();
                }
            );
        }

        var error = false;

        function check(err) {
            if (err) {
                callback(err);
                error = true;
            }
            if (!error && influence.length === nations.length) {
                callback(undefined, influence);
            }
        }
    }

    function printResults(influence, callback) {
        influence.sort(function(a, b) {
            return b.influence - a.influence;
        });

        console.log(
            "\n" + rightpad("Nation", 50) + " Influence");
        for (var i = 0; i < influence.length; i++) {
            console.log(
                rightpad(influence[i].nation, 50) + " " +
                influence[i].influence);
        }

        callback();

        function rightpad(str, num) {
            var len = str.length;
            for (var i = 0; i < num - len; i++) {
                str += " ";
            }
            return str;
        }
    }
}

// The following code executes each example.
console.log("Simple example:\n");
simpleExample(function() {
    console.log();
    console.log("Complex example:\n");
    complexExample(function() {
        console.log();
        api.cleanup();
    });
});
