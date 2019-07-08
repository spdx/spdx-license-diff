module.exports = {
    "env": {
        "browser": true,
        "es6": true,
        "webextensions": true,
        "jquery": true
    },
    "extends": [
        "standard"
    ],
    "globals": {
        "Atomics": "readonly",
        "SharedArrayBuffer": "readonly",
        "_": false,
        "DiffMatchPatch": false,
        "Levenshtein": false
    },
    "parserOptions": {
        "ecmaVersion": 2018,
        "sourceType": "module"
    },
    "rules": {
    }
};
