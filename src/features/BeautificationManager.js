/*
 * Copyright (c) 2019 - present Adobe. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/**
 * Beautification manager interacts with beautify extensions to determine what to do when user issues `beautify code`
 * command. Beautification providers can use this module to register new providers to beautify new languages.
 *
 * ## API
 * ### registerBeautificationProvider
 * Register a Beautification provider with this api.
 *
 * ```js
 * // syntax
 * BeautificationManager.registerBeautificationProvider(provider, supportedLanguages, priority);
 * ```
 * The API requires three parameters:
 * 1. `provider`: must implement a  `beautify` function which will be invoked to beautify code in editor. See doc below.
 * 1. `supportedLanguages`: An array of languages that the provider supports. If `["all"]` is supplied, then the
 *    provider will be invoked for all languages. Restrict to specific languages: Eg: `["javascript", "html", "php"]`
 * 1. `priority`: Used to break ties among providers for a particular language. Providers with a higher number
 *     will be asked for beatified code before those with a lower priority value. Defaults to zero.
 *
 * ```js
 * // to register a provider that will be invoked for all languages. where provider is any object that implements
 * // a beautify function
 * BeautificationManager.registerBeautificationProvider(provider, ["all"]);
 *
 * // to register a provider that will be invoked for specific languages
 * BeautificationManager.registerBeautificationProvider(provider, ["javascript", "html", "php"]);
 * ```
 *
 * ### removeBeautificationProvider
 * Removes a registered Beautification provider. The API takes the same arguments as `registerBeautificationProvider`.
 * ```js
 * // syntax
 * BeautificationManager.removeBeautificationProvider(provider, supportedLanguages);
 * // Example
 * BeautificationManager.removeBeautificationProvider(provider, ["javascript", "html"]);
 * ```
 *
 * ### beautify
 * Each provider must implement the `beautify` function that returns a promise. The promise either resolves with
 * the beautified code details or rejects if there is nothing to beautify for the provider.
 * ```js
 * // function signature
 * provider.beautify = function(editor) {
 *         return new Promise((resolve, reject)=>{
 *             resolve({
 *                 changedText: "partial or full text that changed. If partial, specify the range options below",
 *                 ranges:{
 *                     replaceStart: {line, ch},
 *                     replaceEnd: {line, ch},
 *                     selectStart: {line, ch},
 *                     selectEnd: {line, ch}
 *                 }
 *             });
 *         });
 *     };
 * ```
 * @module features/BeautificationManager
 */
define(function (require, exports, module) {


    const Commands = require("command/Commands"),
        Strings = require("strings"),
        AppInit = require("utils/AppInit"),
        CommandManager = require("command/CommandManager"),
        Menus = brackets.getModule("command/Menus"),
        EditorManager = require("editor/EditorManager"),
        ProviderRegistrationHandler = require("features/PriorityBasedRegistration").RegistrationHandler;

    let _providerRegistrationHandler = new ProviderRegistrationHandler(),
        registerBeautificationProvider = _providerRegistrationHandler
            .registerProvider.bind(_providerRegistrationHandler),
        removeBeautificationProvider = _providerRegistrationHandler
            .removeProvider.bind(_providerRegistrationHandler);

    async function _getBeautifiedCodeDetails(editor) {
        let language = editor.getLanguageForSelection(),
            enabledProviders = _providerRegistrationHandler.getProvidersForLanguageId(language.getId());
        // todo get language for path?

        for(let item of enabledProviders){
            if(!item.provider.beautify){
                console.error("Beautify providers must implement beautify function", item);
                continue;
            }
            try{
                let beautyObject = await item.provider.beautify(editor);
                if(beautyObject){
                    return beautyObject;
                }
            } catch (e) {
                // providers reject if they didn't beautify the code. We do nothing in the case as expected failure.
            }
        }
        return null;
    }

    function _prettify() {
        let editor = EditorManager.getActiveEditor();
        if(!editor){
            return;
        }
        _getBeautifiedCodeDetails(editor).then(beautyObject => {
            if(!beautyObject){
                return;
            }
            let doc = editor.document;
            doc.batchOperation(function() {
                editor.operation(function () {
                    console.log(beautyObject);
                    if(beautyObject.ranges){
                        let ranges = beautyObject.ranges;
                        editor.document.replaceRange(beautyObject.changedText, ranges.replaceStart, ranges.replaceEnd);
                        editor.setSelection(ranges.selectStart, ranges.selectEnd, true);
                    } else {
                        editor.document.setText(beautyObject.changedText);
                        editor.setSelection({line: 0, ch: 0}, editor.getEndingCursorPos());
                    }
                });
            });
        }).catch(e=>{
            console.log("No beautify providers responded", e);
        });
    }

    AppInit.appReady(function () {
        CommandManager.register(Strings.CMD_BEAUTIFY_CODE, Commands.EDIT_BEAUTIFY_CODE, _prettify);
        let editMenu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);
        editMenu.addMenuItem(Commands.EDIT_BEAUTIFY_CODE, "");

        let editorContextMenu = Menus.getContextMenu(Menus.ContextMenuIds.EDITOR_MENU);
        editorContextMenu.addMenuItem(Commands.EDIT_BEAUTIFY_CODE, "", Menus.AFTER, Commands.EDIT_SELECT_ALL);
        // todo active editor change and disable beautify if not supported
    });

    exports.registerBeautificationProvider = registerBeautificationProvider;
    exports.removeBeautificationProvider = removeBeautificationProvider;
});