# Changelog

## [0.5.4](https://github.com/spdx/spdx-license-diff/compare/v0.5.3...v0.5.4) (2020-09-16)


### Bug Fixes

* update submission url to new domain ([3c8f380](https://github.com/spdx/spdx-license-diff/commit/3c8f38080038e96e494877cce417d5a626e83d46))

## [0.5.3](https://github.com/spdx/spdx-license-diff/compare/v0.5.2...v0.5.3) (2020-06-25)


### Reverts

* Revert "ci: change to semantic-release-firefox" ([eb8a23a](https://github.com/spdx/spdx-license-diff/commit/eb8a23af98729ae44736e094684f512d098149d4))

## [0.5.2](https://github.com/spdx/spdx-license-diff/compare/v0.5.1...v0.5.2) (2020-06-25)


### Bug Fixes

* limit template match to entire selection ([52e70b0](https://github.com/spdx/spdx-license-diff/commit/52e70b070665ded6320053067a93205e6918361f)), closes [#58](https://github.com/spdx/spdx-license-diff/issues/58)

## [0.5.1](https://github.com/spdx/spdx-license-diff/compare/v0.5.0...v0.5.1) (2020-06-21)


### Bug Fixes

* fix handling of spaces in corner cases ([beabfaa](https://github.com/spdx/spdx-license-diff/commit/beabfaadb264ee24b98abc055d2e9d8c0e6b7d91))
* handle nested <<beginOptional>> ([94f47f9](https://github.com/spdx/spdx-license-diff/commit/94f47f96cbefbec5bd0dfa5506b8f3e7131672f7))
* show actual diff without cleanup ([196c852](https://github.com/spdx/spdx-license-diff/commit/196c85266869bc683ba2029636ef8f5cda32bfdc))

# [0.5.0](https://github.com/spdx/spdx-license-diff/compare/v0.4.0...v0.5.0) (2020-06-20)


### Bug Fixes

* ignore completed items for background compare ([9fb03f8](https://github.com/spdx/spdx-license-diff/commit/9fb03f8b1cf8916f476db34ccee0b46287f8d12f))


### Features

* add template matching ([06a21ea](https://github.com/spdx/spdx-license-diff/commit/06a21ea3a880a309a35aacfc8edf58ddd89c1fb1))

# [0.5.0](https://github.com/spdx/spdx-license-diff/compare/v0.4.0...v0.5.0) (2020-06-20)


### Bug Fixes

* ignore completed items for background compare ([9fb03f8](https://github.com/spdx/spdx-license-diff/commit/9fb03f8b1cf8916f476db34ccee0b46287f8d12f))


### Features

* add template matching ([06a21ea](https://github.com/spdx/spdx-license-diff/commit/06a21ea3a880a309a35aacfc8edf58ddd89c1fb1))

# [0.5.0](https://github.com/spdx/spdx-license-diff/compare/v0.4.0...v0.5.0) (2020-06-20)


### Bug Fixes

* ignore completed items for background compare ([9fb03f8](https://github.com/spdx/spdx-license-diff/commit/9fb03f8b1cf8916f476db34ccee0b46287f8d12f))


### Features

* add template matching ([06a21ea](https://github.com/spdx/spdx-license-diff/commit/06a21ea3a880a309a35aacfc8edf58ddd89c1fb1))

# [0.5.0](https://github.com/spdx/spdx-license-diff/compare/v0.4.0...v0.5.0) (2020-06-20)


### Bug Fixes

* ignore completed items for background compare ([9fb03f8](https://github.com/spdx/spdx-license-diff/commit/9fb03f8b1cf8916f476db34ccee0b46287f8d12f))


### Features

* add template matching ([06a21ea](https://github.com/spdx/spdx-license-diff/commit/06a21ea3a880a309a35aacfc8edf58ddd89c1fb1))

# [0.4.0](https://github.com/spdx/spdx-license-diff/compare/v0.3.2...v0.4.0) (2020-04-17)

### Features

- add submit new license button ([1b991ac](https://github.com/spdx/spdx-license-diff/commit/1b991acae9f249fa40111bd4d9fe5dea273af0b6)), closes [#19](https://github.com/spdx/spdx-license-diff/issues/19)

## [0.3.2](https://github.com/spdx/spdx-license-diff/compare/v0.3.1...v0.3.2) (2019-10-05)

### Bug Fixes

- add timeout for updating state ([853e4bf](https://github.com/spdx/spdx-license-diff/commit/853e4bf))
- bump firefox min_version ([e84b4b5](https://github.com/spdx/spdx-license-diff/commit/e84b4b5))
- fix background compares processing ([1c8a585](https://github.com/spdx/spdx-license-diff/commit/1c8a585))
- fix failure to update completion state ([fd7ef84](https://github.com/spdx/spdx-license-diff/commit/fd7ef84))
- prevent adding extra compares from same tab ([4887441](https://github.com/spdx/spdx-license-diff/commit/4887441))
- prevent unnecessary final sorts ([a5898c9](https://github.com/spdx/spdx-license-diff/commit/a5898c9))

## [0.3.1](https://github.com/spdx/spdx-license-diff/compare/v0.3.0...v0.3.1) (2019-10-04)

### Bug Fixes

- check for exceptions prior to compare ([c39ae36](https://github.com/spdx/spdx-license-diff/commit/c39ae36))
- fix async steps preventing update completion ([d7a2f8c](https://github.com/spdx/spdx-license-diff/commit/d7a2f8c))
- fix bug where list not updated with item data ([bdab719](https://github.com/spdx/spdx-license-diff/commit/bdab719))
- fix bug where saved list would override work due to async ([346dcea](https://github.com/spdx/spdx-license-diff/commit/346dcea))
- fix case where runningworkers became negative ([7ad83ea](https://github.com/spdx/spdx-license-diff/commit/7ad83ea))
- force reload of list on update ([9988627](https://github.com/spdx/spdx-license-diff/commit/9988627))

# [0.3.0](https://github.com/spdx/spdx-license-diff/compare/v0.2.1...v0.3.0) (2019-10-03)

### Bug Fixes

- remove unsafe innerhtml assignment ([8201ce2](https://github.com/spdx/spdx-license-diff/commit/8201ce2))
- remove unsupported and unused runtime.onsuspend ([2c9644c](https://github.com/spdx/spdx-license-diff/commit/2c9644c))
- update icon size ([7c8e7e0](https://github.com/spdx/spdx-license-diff/commit/7c8e7e0))

### Features

- add initial exceptions support ([22e2891](https://github.com/spdx/spdx-license-diff/commit/22e2891))

## v0.2.1 (07/07/2019)

- [Update build script to package license info](https://github.com/spdx/spdx-license-diff/commit/e70fcfc3f1dc99d72c2ec45cf07cfad9100cfb37) - @alandtse
- [Fix typo in markdown for Firefox Add-ons](https://github.com/spdx/spdx-license-diff/commit/ecce4473a336932c83f8c0db62281ddb3fcfeff3) - @alandtse
- [Bump to 0.2.1](https://github.com/spdx/spdx-license-diff/commit/f9acd8299dc16eb0314cb8deaf4305a23d2072ab) - @alandtse
- [Fix bug where showBest was not properly allowing for unlimited](https://github.com/spdx/spdx-license-diff/commit/a1ee405886d8c876decc75d7d97eb417d76b1074) - @alandtse
- [Fix typo in credits](https://github.com/spdx/spdx-license-diff/commit/e5be502e82b9e9da86bfe19f53cc82e1d9910bab) - @alandtse
- [Replace fast-levenshtein with js-levenshtein](https://github.com/spdx/spdx-license-diff/commit/05ced438afbec96223097714cb0b0d9a8743e664) - @alandtse
- [Add firefox test command](https://github.com/spdx/spdx-license-diff/commit/4f24f5452acf64b2c41ce4bd811807b9c443c7f6) - @alandtse
- [Change version value to read from manifest.json](https://github.com/spdx/spdx-license-diff/commit/e8a255ad2109da1a76c9c172a25bc706401c4234) - @alandtse
- [Update developers documentation](https://github.com/spdx/spdx-license-diff/commit/66f6c54a804eb10010e24c7111031daaae789a9f) - @alandtse
- [Migrate to webextension-toolbox for build](https://github.com/spdx/spdx-license-diff/commit/4e32bbb061646840cdc762363245712e81dcdf7e) - @alandtse
- [Add Firefox Add-ons info](https://github.com/spdx/spdx-license-diff/commit/6a66c10869ecf7a80b483e365d4e3a6ac1b898d5) - @alandtse
- [Add eslint](https://github.com/spdx/spdx-license-diff/commit/8080a674efcba376aa5145373ca42b600da688ee) - @alandtse

---

## v0.2.0 (04/07/2019)

- [bump package version](https://github.com/spdx/spdx-license-diff/commit/7e110c20798a6ea84f7aca10bfbd848283de5c59) - @alandtse
- [Bump version](https://github.com/spdx/spdx-license-diff/commit/e078ca7a58e2d02ab61528edadfac663c1a062d0) - @alandtse
- [Fix bug where firefox didn't report local storage size](https://github.com/spdx/spdx-license-diff/commit/5f185c6dd910e659d608a6a7e2fe55884bb09ff6) - @alandtse
- [Update dependencies](https://github.com/spdx/spdx-license-diff/commit/5540475001081ef4133f6bb89a5659f8791d8249) - @alandtse
- [Fix bug where defaults for filter not set](https://github.com/spdx/spdx-license-diff/commit/2d10e26e45c0780796aaf87d12f6780cdc3c32ec) - @alandtse
- [Remove unused storing of details](https://github.com/spdx/spdx-license-diff/commit/d6a0c119be0f29498b7d9e8d96b1ae40b2a755d8) - @alandtse
- [Add additional UI information](https://github.com/spdx/spdx-license-diff/commit/e6b100c088e302b72a7802794207b42021cf0316) - @alandtse
- [Add version to log info](https://github.com/spdx/spdx-license-diff/commit/76748970afde4802e9f757b0e829484163499df5) - @alandtse
- [Add filtering support](https://github.com/spdx/spdx-license-diff/commit/d6eb91b63e714bcca346c17e71fe639b08f38edc) - @alandtse
- [Fix spacing](https://github.com/spdx/spdx-license-diff/commit/a8242edf1208edc818c0c06186121babcfda0b5f) - @alandtse
- [Update default options](https://github.com/spdx/spdx-license-diff/commit/a1b816ef88c0629d9c4bf92b6fa21d7619996464) - @alandtse
- [Change options.js to dynamically build filters](https://github.com/spdx/spdx-license-diff/commit/8c801fb30dd0d6a26c39394fa7e9e18ebaa19631) - @alandtse
- [Reformat options ui](https://github.com/spdx/spdx-license-diff/commit/4316c1c40f3da9192780f28c2a2b7b54e78ce08a) - @alandtse
- [Add deprecated filter](https://github.com/spdx/spdx-license-diff/commit/61ee5b2036269f7bec7257937d3a2b909486b372) - @alandtse

---

## v0.1.1 (10/01/2019)

- [bump package version](https://github.com/spdx/spdx-license-diff/commit/391bcb60f3e051183f060f086d953f89fa6bca3b) - @alandtse
- [Add Valid-License-Identifier to LICENSE file](https://github.com/spdx/spdx-license-diff/commit/7ec63f120a3995df908e9c6b774a6b4b28350cba) - @alandtse
- [Fix infinite spawning of workers by saving options as ints](https://github.com/spdx/spdx-license-diff/commit/b86b944b5eb53cfe915c4e5669df373074cb573e) - @alandtse

---

## v0.1.0 (21/12/2018)

- [bump package version](https://github.com/spdx/spdx-license-diff/commit/adce24d35b3f7e4b287fc8104afeca76852987a3) - @alandtse
- [Address #5 by changing name and other tasks](https://github.com/spdx/spdx-license-diff/commit/582946059616a8102164719a4d00bcb7a94f60b3) - @alandtse
- [Convert to eslint](https://github.com/spdx/spdx-license-diff/commit/873f7f43e26e36b0c4982290698298c680c84c0b) - @alandtse

---

## v0.0.7 (17/12/2018)

- [bump package version](https://github.com/spdx/spdx-license-diff/commit/203c4cbb18713314afc6a34f458c6a0048fd5462) - @alandtse
- [Add changelog](https://github.com/spdx/spdx-license-diff/commit/53f24532dd0b6bfd0e8ac2c9f7586a47eecdd176) - @alandtse
- [Clean up worker code based on jshint](https://github.com/spdx/spdx-license-diff/commit/4be2fecf01de99dce0f69695c824620785d37108) - @alandtse

---

## v0.0.6 (15/12/2018)

- [bump package version](https://github.com/spdx/spdx-license-diff/commit/4dc28218c7d329229a80c926fe067260fd21a751) - @alandtse
- [Fix #8 by adding check for content script insertion success](https://github.com/spdx/spdx-license-diff/commit/cd6fbcc613bed6df5b1ffb2f0c9b497b25c8c810) - @alandtse
- [Refactor handleUpdate for tabs](https://github.com/spdx/spdx-license-diff/commit/6d418234d534f5155cdc6b15350fd192276e47cf) - @alandtse
- [Remove local license-list in build to reduce size](https://github.com/spdx/spdx-license-diff/commit/83b9efb8095dba263df2b3dbe354935e755c5dd1) - @alandtse
- [Move non-app images to root images folder](https://github.com/spdx/spdx-license-diff/commit/051d73e392e9eb75ab2a9aeafd05b0b27174bdbd) - @alandtse
- [Fix #6 by converting diff-match-patch html to xhtml](https://github.com/spdx/spdx-license-diff/commit/9879bc259cf1d5b5514f4deb0b4e99bd8615dd01) - @alandtse

---

## v0.0.5 (14/12/2018)

- [add changelog](https://github.com/spdx/spdx-license-diff/commit/6252e14a74187e2b69a6a82032b675fa589dcfb1) - @alandtse
- [bump package version](https://github.com/spdx/spdx-license-diff/commit/c1b2fcec7ed16c802646cc1a0f5df414203d7ddd) - @alandtse
- [Add further checks to load list prior to compare](https://github.com/spdx/spdx-license-diff/commit/e522eb48ad2fd8db3ed05aa36c5f1e0a94af3d6d) - @alandtse

---

## v0.0.4 (13/12/2018)

- [bump package version](https://github.com/spdx/spdx-license-diff/commit/2737192005a4fd190eaa91b82b882459704cbada) - @alandtse

---

## v0.0.3 (08/11/2018)

- [Add changelog generation using gren to tasks](https://github.com/spdx/spdx-license-diff/commit/3f778a63bbb03d08fe00480964e499570af5f16f) - @alandtse
- [Update changelog](https://github.com/spdx/spdx-license-diff/commit/f4090ab460c128ef771f8f062e10682071ae75e0) - @alandtse
- [Add gren changelog generation](https://github.com/spdx/spdx-license-diff/commit/0108481dc8e0e3ee4c333d2d6ecc9c259c3537cd) - @alandtse
- [Update diff-match-patch to 1.0.4](https://github.com/spdx/spdx-license-diff/commit/8cb1def42bbb93e2570372e6cb94b465e0dcbe43) - @alandtse

---

## v0.0.2 (26/10/2018)

- [bump package version](https://github.com/spdx/spdx-license-diff/commit/423df1977216fcdf1de153e05bbbcad616ea65ab) - @alandtse
- [Move addListeners to top level to resolve #3](https://github.com/spdx/spdx-license-diff/commit/d36deb39316981194782dff1c6e87d28c19cb004) - @alandtse

---

## v0.0.1 (15/08/2018)

- [Updating README to add Firefox instructions](https://github.com/spdx/spdx-license-diff/commit/cce82e40ee845cde38607a40a253a8504cadfca4) - @alandtse
- [bump package version](https://github.com/spdx/spdx-license-diff/commit/7172a0a492e3e53f8f5ee694c2b39f27c1bd3546) - @alandtse
- [Add Firefox support](https://github.com/spdx/spdx-license-diff/commit/405e6205c9509c3664b9619c4fdcd42f9ad9cee6) - @alandtse
- [Beginning Firefox addon changes](https://github.com/spdx/spdx-license-diff/commit/ed0c0c69fe70df8fcbabe614ac120021fcf189b1) - @alandtse
- [Fix double injection bug](https://github.com/spdx/spdx-license-diff/commit/67aabcb782975eb71166bbba6543ea67680b568b) - @alandtse
- [Change to activeTab permission](https://github.com/spdx/spdx-license-diff/commit/4c4b9bb127a459daedc7fe1982a14adb349fc62e) - @alandtse
- [Remove unused worker_proxy](https://github.com/spdx/spdx-license-diff/commit/4a95520b7ca1e09691fda191045608ef850f601d) - @alandtse
- [Enable max result option with 0](https://github.com/spdx/spdx-license-diff/commit/e94f198409ef19fd76c599b6eca1345bcf0c2bf3) - @alandtse
- [Enable unlimited max length difference option using 0](https://github.com/spdx/spdx-license-diff/commit/cc46591ce505d5ce961171a209e7a22efaed3b0c) - @alandtse
- [Fixing last update date to display stored date](https://github.com/spdx/spdx-license-diff/commit/3668b00c07f6eca9cca1091a0a6c411b094e3934) - @alandtse
- [Adding queue prioritization for active tab](https://github.com/spdx/spdx-license-diff/commit/fc39ca2836d744e008023adf8b43e5312db6f8b3) - @alandtse
- [Implement multiple tab compare queing](https://github.com/spdx/spdx-license-diff/commit/13e627b83bac646daf788763afdd3818d844370a) - @alandtse
- [Cleaning up readability by replacing arrays with dicts](https://github.com/spdx/spdx-license-diff/commit/466e132001fc06da25cb09be210453503c096e1d) - @alandtse
- [Updated results to show links and better progress status](https://github.com/spdx/spdx-license-diff/commit/599226bb8ef1effe524df31a9dac0905a6ba0c8c) - @alandtse
- [Cleaning up unused code/variables](https://github.com/spdx/spdx-license-diff/commit/6270e949781c9db4f202295c0e302ef150a905b6) - @alandtse
- [Fixing UI updates](https://github.com/spdx/spdx-license-diff/commit/c743113a9e9a2fdaff6fba7bc1e14c6843755d95) - @alandtse
- [Moving processing to background script](https://github.com/spdx/spdx-license-diff/commit/64d45153c85d7d6ee81f7ad2a41bb79fc0bd967e) - @alandtse
- [Enabling update list in options](https://github.com/spdx/spdx-license-diff/commit/cced217f91b2a80c8cfef46d9c01ca9aecf56a47) - @alandtse
- [Moving processing to background script](https://github.com/spdx/spdx-license-diff/commit/7d4d4a847627ce35a5e51f2d6acdd860e9bef2ce) - @alandtse
- [Fixing bug where option's did not refresh list and storage data after update](https://github.com/spdx/spdx-license-diff/commit/b93678bbacb142c0e0a0781b56e48753eda32e68) - @alandtse
- [Fixing bug where compare not queued during update](https://github.com/spdx/spdx-license-diff/commit/5a670719b79187d01bbfa8d000c316cf8350e580) - @alandtse
- [Adding details to options page](https://github.com/spdx/spdx-license-diff/commit/11a2d8c0cafd51921a92aa2be7ed34eed005baff) - @alandtse
- [Removing used code and files](https://github.com/spdx/spdx-license-diff/commit/27902bb868e10d3a37de42f0b5662b42fbc0b580) - @alandtse
- [Rearranging contentscript to better group code logically](https://github.com/spdx/spdx-license-diff/commit/914b4b7a4fad60f373a159836f27544a00771584) - @alandtse
- [Breaking out stackoverflow code to own file](https://github.com/spdx/spdx-license-diff/commit/78045668062ef99f9382d269c51456dfe9128a69) - @alandtse
- [Added default values if options not set](https://github.com/spdx/spdx-license-diff/commit/749c954cf9fc519bf3436a3f22edd24a43f6ff17) - @alandtse
- [Updated UI to disable select options that are still processing](https://github.com/spdx/spdx-license-diff/commit/9a30085f005c33e6a8ccd07bc6118fe6add2c7ea) - @alandtse
- [Adding updateProgressBar function](https://github.com/spdx/spdx-license-diff/commit/8e6f4993d5e13b2d1c053f726522cbabd9045d25) - @alandtse
- [Fixing bug #1](https://github.com/spdx/spdx-license-diff/commit/0dabd8848ac94df1ebcea7f7fdef0960a7cdc210) - @alandtse
- [Updating README with more detail](https://github.com/spdx/spdx-license-diff/commit/112474440ee6c0ece770c7a19fdec4c557af1d2e) - @alandtse
- [Adding options page](https://github.com/spdx/spdx-license-diff/commit/c2dde1fc690349aa8d50b7a9d74d7766b912d7e7) - @alandtse
- [Moved diff generation to worker thread](https://github.com/spdx/spdx-license-diff/commit/abddbd8fa0f4a48ee87c4ab2b13165ace0ee9d9d) - @alandtse
- [Adding oss attribution task and cleaning up other tasks](https://github.com/spdx/spdx-license-diff/commit/0a3be837d00ac362a3e7a3f23a5f2cd9e3dc6032) - @alandtse
- [Updating to webpack4 and yarn](https://github.com/spdx/spdx-license-diff/commit/3ba9013eea3199810c499a1162dec4c26262b5c9) - @alandtse
- [Adding min threshold and storage of new licenses only](https://github.com/spdx/spdx-license-diff/commit/705fac9c8960c4156997d825bf1e0f12b6b2a3d9) - @alandtse
- [Fix various bugs and update logs](https://github.com/spdx/spdx-license-diff/commit/e7a7b81b35a254558e75f6d6e975ca67c7754a72) - @alandtse
- [Adding gulp-cli](https://github.com/spdx/spdx-license-diff/commit/d8675c61730be1915a6fc9dc780176068ecc835a) - @alandtse
- [Added multithreading processing](https://github.com/spdx/spdx-license-diff/commit/567bc9c00d50ed431672990b5e5cc1113c214f9f) - @alandtse
- [Added basic work queuing](https://github.com/spdx/spdx-license-diff/commit/a57aae2b62603188eeeb184993a28c756d696d65) - @alandtse
- [Cleaning unused function and adding line counting](https://github.com/spdx/spdx-license-diff/commit/bcfa161b2484bb44199f55abb6d4aed96bfd131c) - @alandtse
- [Adding background and caching of licenses.](https://github.com/spdx/spdx-license-diff/commit/1e91aca4ae5ef0bbbc00937c0817874d34b317fc) - @alandtse
- [Adding network download option (slow)](https://github.com/spdx/spdx-license-diff/commit/6eb6e871211d0da3a36ae8a810762aee50e4e6b9) - @alandtse
- [Adding preliminary attribution notice](https://github.com/spdx/spdx-license-diff/commit/6d3e551ada7b3df973048cfa0ff63ebb5cf87eea) - @alandtse
- [Fixing spdx.txt creation](https://github.com/spdx/spdx-license-diff/commit/c4a6316eec4fa9ee44b99a664e93ae3afad2c108) - @alandtse
- [Refactored build script to pull license-list from git](https://github.com/spdx/spdx-license-diff/commit/e3a1032913eef8723886426e25e5b795d9728318) - @alandtse
- [Updating build script to generate spdx.txt](https://github.com/spdx/spdx-license-diff/commit/d2ac02751ff3fef0b81eb8e72da300af0eef1a51) - @alandtse
- [Begin refactoring of stackoverflow code](https://github.com/spdx/spdx-license-diff/commit/5691d035c349da21a86281260f1199f867cfda72) - @alandtse
