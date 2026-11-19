# 1.0.0 (2026-11-19)


* feat(release)!: ship Crown Books 1.0 ([c08a902](https://github.com/Vr3n/crown-crm/commit/c08a902b86a4077473ca40fae0e154367bbcd7b9))


### Bug Fixes

* **accounts:** gate the ledger by view and manage permissions ([#16](https://github.com/Vr3n/crown-crm/issues/16)) ([87eb9b6](https://github.com/Vr3n/crown-crm/commit/87eb9b6428bcaf4ea0f21b4afe75a4fcb0358b41))
* **ci:** upload the installer name electron-builder emits ([55c1f0f](https://github.com/Vr3n/crown-crm/commit/55c1f0fbf20fd6430d0937eb149e13778b00a6ca))
* **dashboard:** drop unused attention totals ([6fffd87](https://github.com/Vr3n/crown-crm/commit/6fffd8758dd0c79db7553b8a1c5c997d4dc0eb0e))
* **dev:** keep the dev database out of the release data path ([a968df8](https://github.com/Vr3n/crown-crm/commit/a968df8861dee276b6449f510d42b5518a3cc6e5))
* **forms:** clear blur errors as soon as the value is fixed ([822a92d](https://github.com/Vr3n/crown-crm/commit/822a92d7d1989e1f9ecee3a299307e4e9576a839))
* **identity:** keep the boot splash while the remembered session loads ([5efa73b](https://github.com/Vr3n/crown-crm/commit/5efa73be138eb8065df8e07d1ba91485ed2af228))
* **print:** shared PDF geometry, continuous frames and aligned columns ([#32](https://github.com/Vr3n/crown-crm/issues/32)) ([71004fb](https://github.com/Vr3n/crown-crm/commit/71004fbf1142cf321c7feda351cea4ad25302e58)), closes [#28](https://github.com/Vr3n/crown-crm/issues/28)
* **tests:** annotate the sample bill planner return type ([d2242db](https://github.com/Vr3n/crown-crm/commit/d2242db03c6baf4534934048953759387143b981))
* **ui:** show Ctrl+K on Windows and clamp backup age ([6c6471f](https://github.com/Vr3n/crown-crm/commit/6c6471f017f1725e86981d4fa2382eb6df443f61))
* **vouchers:** give entry fields a visible input border ([fee564f](https://github.com/Vr3n/crown-crm/commit/fee564f1d84fd04c6be0ab27ea358d2095ef8d86))


### Features

* 16px rem typography, DPI-safe scaling and ledger personality ([93cad75](https://github.com/Vr3n/crown-crm/commit/93cad7552ea60e7897f8a089db1b22ec60f2291e))
* **access:** local users, permission roles and voucher audit ([#15](https://github.com/Vr3n/crown-crm/issues/15)) ([2ec7910](https://github.com/Vr3n/crown-crm/commit/2ec7910209e5e2e5880e47cee73d72e920cad151))
* **backup:** write every backup to multiple folders ([e45711c](https://github.com/Vr3n/crown-crm/commit/e45711cc2f3e8e1f12b446514a85b22bbd268e54))
* **company:** add editable company logo ([993a27f](https://github.com/Vr3n/crown-crm/commit/993a27f7c99a97376650c9cdca24853deec2c393))
* **dashboard:** real setup progress, module accents and charts ([0c25ce3](https://github.com/Vr3n/crown-crm/commit/0c25ce302cdce58bc5aee9b10c3a431b5d60521f))
* **debug:** structured logs, trace ids and a logs CLI ([d0bc789](https://github.com/Vr3n/crown-crm/commit/d0bc789732bbcd65d2735ea71bdc77a97d7bdb06))
* **export:** real XLSX files for reports and document lists ([fc590d7](https://github.com/Vr3n/crown-crm/commit/fc590d760c7731108f1999c56c277a32482a416d))
* **export:** reveal the saved file in the folder ([b34117b](https://github.com/Vr3n/crown-crm/commit/b34117b6d3de15341cf19f3e1937417dd48ebb4c))
* **forms:** cap mobile inputs at ten digits and add dashboard quick actions ([60df07d](https://github.com/Vr3n/crown-crm/commit/60df07dc26ec3ca87750907d8c43aed35852c39a))
* **forms:** required state, live validation and field help ([31ebe45](https://github.com/Vr3n/crown-crm/commit/31ebe456857eed58581bed23fb9b978b1e573295))
* **import:** excel importer prototype with range, mapping and review ([41e5c47](https://github.com/Vr3n/crown-crm/commit/41e5c4782673f774a16cebd9f2e0f5612979f9cd))
* **invoice:** match the sample tax invoice content and fill the page ([5d72e0d](https://github.com/Vr3n/crown-crm/commit/5d72e0dc46a49e23b6da8003f479291205a8a3f3))
* **invoice:** panel the supplier and buyer blocks and quiet e2e ([08962dc](https://github.com/Vr3n/crown-crm/commit/08962dcd5e39e8da2666ece47658b9e0bd3349b8))
* **invoice:** print the company logo on the invoice header ([211c1e3](https://github.com/Vr3n/crown-crm/commit/211c1e317066a77bfbc5d20cdcb2d6fc7024c777))
* **invoice:** print two-copy GST invoices and export PDF ([e072e6d](https://github.com/Vr3n/crown-crm/commit/e072e6d215535009dc51fb34238af11dcea04c96))
* **items:** take GST and cess as typed percentages ([#39](https://github.com/Vr3n/crown-crm/issues/39)) ([aab15ed](https://github.com/Vr3n/crown-crm/commit/aab15ed914e97fae1d9cc3537e4bd399678e4605))
* **items:** tax breakup on purchase and sale prices ([#31](https://github.com/Vr3n/crown-crm/issues/31)) ([533f11a](https://github.com/Vr3n/crown-crm/commit/533f11a0b0b78c35ef5dc535776d45588b706317)), closes [#27](https://github.com/Vr3n/crown-crm/issues/27)
* masters, voucher posting engine and report queries ([d1b5f5e](https://github.com/Vr3n/crown-crm/commit/d1b5f5e31fd3f446826ba072ebc6a0ed42b0d33c))
* masters, vouchers, reports, stock, journals, backup and Playwright flow ([b748e73](https://github.com/Vr3n/crown-crm/commit/b748e736407311510e1596d591a0538ca2555995))
* **masters:** editable units and effective-dated tax rates ([#14](https://github.com/Vr3n/crown-crm/issues/14)) ([4675070](https://github.com/Vr3n/crown-crm/commit/4675070d2e1ed079a901de96183ebf9cbef5e249))
* migrate the desktop shell from Electron to Tauri 2 ([15ea584](https://github.com/Vr3n/crown-crm/commit/15ea5848707d6acc5eda1a0a5dc711c9c930d09e))
* **numbering:** date tokens, monthly reset and GST length rules ([47438df](https://github.com/Vr3n/crown-crm/commit/47438dfee901562d548587095ca8fd81985966e1))
* **numbering:** editable voucher series and first run wizard ([c560d1f](https://github.com/Vr3n/crown-crm/commit/c560d1f847fcb2c80ab674abab35917929721006)), closes [hi#water](https://github.com/hi/issues/water)
* **onboarding:** make the dashboard checklist the setup guide ([4d91720](https://github.com/Vr3n/crown-crm/commit/4d917206f27892025db952f0e27633a03958f4f3))
* **purchases:** number a bill with the supplier's bill number ([#34](https://github.com/Vr3n/crown-crm/issues/34)) ([46fefd1](https://github.com/Vr3n/crown-crm/commit/46fefd196feffaa25065fee2000e1c48bdcfa74d)), closes [#26](https://github.com/Vr3n/crown-crm/issues/26)
* rebase product on accounting schema and Ledger Paper shell ([9782f6c](https://github.com/Vr3n/crown-crm/commit/9782f6c95fe9ed43c1331974b338733ae63dd88c))
* **reports:** contextual charts and semantic table colour ([#35](https://github.com/Vr3n/crown-crm/issues/35)) ([d2573be](https://github.com/Vr3n/crown-crm/commit/d2573be6c1b9aaaaa5c1e0bfb0026cfff2feb429)), closes [#29](https://github.com/Vr3n/crown-crm/issues/29)
* **search:** global command palette for masters, vouchers and screens ([ce121d9](https://github.com/Vr3n/crown-crm/commit/ce121d96721866ede1041be257f4b6ee02652fdc))
* **ui:** company summary, journal history and voucher audit ([74f472d](https://github.com/Vr3n/crown-crm/commit/74f472dbdbc0812a7f7e3f4fe5407b1893d6e3d0))
* **ui:** decision-first lists, report metrics and exports ([0180bee](https://github.com/Vr3n/crown-crm/commit/0180beeb84b0bd4d7c2376c2656fc51d66572e7b))
* **ui:** full-page party and item detail views ([9b34d00](https://github.com/Vr3n/crown-crm/commit/9b34d009481c0bd04c2df25eb038933130d766a2))
* **ui:** metrics for the chart of accounts and backups ([93d00ba](https://github.com/Vr3n/crown-crm/commit/93d00ba2daf906f0bb4de51f4bf705c070ae67e8))
* **ui:** page scaffolds and contextual insights for parties, items and stock ([b68ea36](https://github.com/Vr3n/crown-crm/commit/b68ea366742823882e0c0cbfa7c50f22d2e5b7a7))
* **update:** install new GitHub releases from the app ([d0ee686](https://github.com/Vr3n/crown-crm/commit/d0ee686992b96e2c440b7931a518cfbbb208c4c7))
* **ux:** setup validation feedback, wider dialogs and receipt context ([#45](https://github.com/Vr3n/crown-crm/issues/45)) ([2373f04](https://github.com/Vr3n/crown-crm/commit/2373f0449152138884e6cfdf28373ec95764f514))
* **vouchers:** create parties and items from voucher pickers ([#38](https://github.com/Vr3n/crown-crm/issues/38)) ([3801883](https://github.com/Vr3n/crown-crm/commit/38018831eaab78bdc9106148b2fda5f68e723483))
* **vouchers:** visible party and item pickers, clearer entry hierarchy ([668bf7a](https://github.com/Vr3n/crown-crm/commit/668bf7aeb54af291e18cd6eea1bcb033b779a239))


### BREAKING CHANGES

* Crown Books 1.0 is the first stable release. The 0.1.0 prototype does not contain the updater, so those installations must install 1.0.0 once by hand; updates from 1.0.0 onward are automatic.

This marks the updater and the settled capture forms as the 1.0 surface instead of shipping them as 0.2.0.
