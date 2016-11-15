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

// TODO: Replace the user agent with your own
var api = new nsapi.NsApi("<user agent>");

// The following is a simple example that retrieves the nation Auralia's full
// name and prints it to the console.
function example1() {
    return api.nationRequest("Auralia", ["fullname"])
              .then(function(data) {
                  console.log(data["fullname"]);
              });
}

// The following is the same example as example 1, but notice how it completes
// much faster because the previous request was cached!
function example2() {
    return api.nationRequest("Auralia", ["fullname"])
              .then(function(data) {
                  console.log(data["fullname"]);
              });
}

// The following example retrieves the delegate, founder, and list of nations
// in the region of Catholic
function example3() {
    return api.regionRequest("Catholic", ["nations", "delegate", "founder"])
              .then(function(data) {
                  console.log("Region of Catholic");
                  console.log("Delegate: " + data["delegate"]);
                  console.log("Founder: " + data["founder"]);
                  console.log("Nations: " + data["nations"].split(":"));
              })
}

// The following example retrieves the last 5 founding happening entries.
function example4() {
    return api.worldRequest(["happenings"],
                            {filter: "founding", limit: "5"})
              .then(function(data) {
                  for (var i = 0; i < data["happenings"]["event"].length; i++) {
                      var event = data["happenings"]["event"][i];
                      console.log("Event ID: " + event["id"]);
                      console.log("Event Timestamp: " + event["timestamp"]);
                      console.log("Event Text: " + event["text"]);
                      console.log();
                  }
              })
}

// The following is a complex example that retrieves and sorts the list of
// nations in the region of Catholic by their influence score, then prints the
// list to the console.
function example5() {
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
function example6() {
    // TODO: Replace the nation name and password with your own
    var nationName = "<nation name>";
    var nationPassword = "<nation password>";

    let auth = {
        password: nationPassword,
        updatePin: true
    };
    return api.nationRequest(
        nationName,
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
           console.log("\nExample 4:\n");
           return example4();
       })
       .then(function() {
           console.log("\nExample 5:\n");
           return example5();
       })
       .then(function() {
           console.log("\nExample 6:\n");
           return example6();
       })
       .catch(function(err) {
           console.log(err);
       })
       .then(function() {
           api.cleanup();
       });
