/*
 * gulp-useref-weh
 *
 * @summary an integration of useref into gulp, solves some gulp-useref issues
 * @author Michel Gutierrez
 * @link https://github.com/mi-g/weh
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const useref = require("./useref");
const es = require('event-stream');
const through = require('through2');
const minimatch = require("minimatch");
const glob = require("glob");
const gulp = require("gulp");
const debug = require("gulp-debug");
const concat = require("gulp-concat");
const gulpif = require("gulp-if");
const streamqueue = require('streamqueue');
const path = require("path");
const gutil = require('gulp-util');
const File = gutil.File;

module.exports = function () {

    var handlers, options;

    if(Array.isArray(arguments[0])) {
        handlers = arguments[0];
        options = arguments[1] || {};
    } else {
        handlers = [{src:"**/*.{js,css}"}];
        options = arguments[0] || {};
    }

    function GetAssetStreams(oName,scripts,callback) {

        var assetStreams = [];

        scripts.forEach(function(script) {
            if(handlers.every(function(handler) {
                var patterns = handler.src;
                if(!Array.isArray(patterns))
                    patterns = new Array(patterns);
                if(!patterns.every(function(pattern) {
                    var files = glob.sync(pattern);
                    if(!files.every(function(file) {
                        if(minimatch(file,script,{matchBase:true})) {
                            assetStreams.push(handler.stream && handler.stream(file) || gulp.src(file));
                            return false;
                        }
                        return true;
                    }))
                       return false;
                    return true;
                }))
                   return false
                return true;
            }))
                console.warn("gulp-useref-weh: No handler found for",script);
        });

        return assetStreams;
    }


    return through.obj(function (file, enc, callback) {

        var self = this;
        var output = useref(file.contents.toString(),{
            noconcat: !!options.noconcat,
            changeExt: options.changeExt
        });
        var outputHTML = output[0];
        var allAssets = output[1];
        var processCount = 1;

        function Done() {
            if(--processCount==0)
                callback();
        }

        for(var type in allAssets) {
            for(var oName in allAssets[type])
                (function(oName) {
                    var streams = GetAssetStreams(oName,allAssets[type][oName].assets);
                    if(options.noconcat)
                        processCount+=streams.length;
                    else
                        processCount++;
                    streamqueue.apply(null,[{objectMode:true}].concat(streams))
                        .on("error",function(err) {
                            console.log('[Compilation Error]');
                            console.log(err.fileName + ( err.loc ? `( ${err.loc.line}, ${err.loc.column} ): ` : ': '));
                            console.log('error Babel: ' + err.message + '\n');
                            console.log(err.codeFrame);
                            this.emit("end");
                        })
                        .pipe(gulpif(!options.noconcat,concat(oName)))
                        .pipe(through.obj(function(file,enc,cb) {
                            self.push(file);
                            cb();
                            Done();
                        }));
                })(oName);
        }

        var appBasePath = path.dirname(file.path);
		var cwd = process.cwd();
        process.chdir(appBasePath);

        this.push(new File({
            path: file.path,
            contents: Buffer.from(outputHTML)
        }));

        process.chdir(cwd);

        Done();
    });

}