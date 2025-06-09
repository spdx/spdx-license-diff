import js from "@eslint/js";

export default [
    js.configs.recommended,
    {
        languageOptions: {
            globals: {
                // Chrome extension APIs
                chrome: "readonly",
                browser: "readonly",
                
                // Browser APIs
                console: "readonly",
                document: "readonly",
                window: "readonly",
                navigator: "readonly",
                location: "readonly",
                URL: "readonly",
                alert: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                
                // Web Worker APIs
                self: "readonly",
                postMessage: "readonly",
                Worker: "readonly",
                MessageChannel: "readonly",
                MessagePort: "readonly",
                
                // DOM APIs
                Event: "readonly",
                XMLSerializer: "readonly",
                DOMParser: "readonly",
                XMLHttpRequest: "readonly",
                
                // Network APIs
                AbortController: "readonly",
                fetch: "readonly",
                Request: "readonly",
                Response: "readonly",
                Headers: "readonly",
                
                // Libraries
                $: "readonly",
                jQuery: "readonly",
                _: "readonly",
                Levenshtein: "readonly",
                dice: "readonly",
                
                // ES2020+ globals
                Atomics: "readonly",
                SharedArrayBuffer: "readonly"
            },
            ecmaVersion: 2020,
            sourceType: "module",
        },
        rules: {
            "no-unused-vars": ["error", { 
                "argsIgnorePattern": "^_",
                "varsIgnorePattern": "^_"
            }],
            "no-console": "off",
            "no-empty": ["error", { "allowEmptyCatch": true }]
        },
    }
];