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

"use strict";

var gulp = require("gulp");
var merge2 = require("merge2");
var sourcemaps = require("gulp-sourcemaps");
var typedoc = require("gulp-typedoc");
var typescript = require("gulp-typescript");

gulp.task("default", ["prod"]);

var project = typescript.createProject("tsconfig.json");
gulp.task("prod", function() {
    var result = project.src()
                        .pipe(project(typescript.reporter.longReporter()));
    return merge2([result.js
                         .pipe(gulp.dest("lib")),
                   result.dts
                         .pipe(gulp.dest("lib"))]);
});
gulp.task("dev", function() {
    var result = project.src()
                        .pipe(sourcemaps.init())
                        .pipe(project(typescript.reporter.longReporter()));
    return merge2([result.js
                         .pipe(sourcemaps.write())
                         .pipe(gulp.dest("lib")),
                   result.dts
                         .pipe(gulp.dest("lib"))]);
});
gulp.task("docs", function() {
    return gulp.src("src")
               .pipe(typedoc({
                                 mode: "file",
                                 module: "commonjs",
                                 out: "docs",
                                 target: "es5",
                                 ignoreCompilerErrors: true
                             }));
});
