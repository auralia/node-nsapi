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

// Create main API object (replace the user agent with your own)
var api = new nsapi.NationStatesApi("<user agent>");

// The following is a simple example that retrieves a nation's full name and
// prints it to the console.
function example1() {
    return api.nationRequest("Auralia", ["fullname"])
              .then(function(data) {
                  console.log(data["fullname"]);
              });
}

// The following is a more complex example that retrieves and sorts a list of
// nations in a region by their influence score, then prints the list to the
// console.
function example2() {
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

// The following example uses private shards to retrieve the notices associated
// with a nation from the last 24 hours and print them to the console, along
// with the PIN required for future private shard requests.
function example3() {
    // Replace the nation name and password with your own
    let auth = {
        password: "<your password>",
        updatePin: true
    };
    return api.nationRequest(
        "<your nation>",
        ["notices"],
        {"from": String(Math.floor(Date.now() / 1000) - (60 * 60 * 24))},
        auth)
              .then(function(data) {
                  console.log(data["notices"]);
                  console.log("PIN: " + auth.pin);
              });
}

// The following code executes each example.
Promise.resolve()
       .then(function() {
           console.log("Example 1:\n");
           return example1();
       })
       .then(function() {
           console.log("\nExample 2:\n");
           return example2();
       })
       .then(function() {
           console.log("\nExample 3:\n");
           return example3();
       })
       .then(function() {
           api.cleanup();
       })
       .catch(function(err) {
           console.log(err);
       });
