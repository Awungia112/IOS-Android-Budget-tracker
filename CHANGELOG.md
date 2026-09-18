# Changelog

## [4.6.1](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.6.1-test-5...v4.6.1) (2026-08-27)

# [4.6.0](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.5.4...v4.6.0) (2026-08-22)


### Bug Fixes

* **#449:** remove empty default "Personal" account after local migration ([7e007af](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7e007af05ba5ea24fc1cff037bd5980ddedd2a99)), closes [#449](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/449)
* **app:** remove unused error state styles in InviteDetailDialog ([1a1e461](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1a1e461b4cc6ce6e882e98bbc48641e673c518d3))
* **app:** surface session-expired message in invite dialog ([206a3a0](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/206a3a0ba797af1a38d00433529eccf29d53e5d0))
* **core:** add duplicate migration remediation detection ([7d9a1af](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7d9a1aff52e185918c2b6328672822b63d5bd93f))
* **core:** scope android legacy ids by account ([#470](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/470)) ([a682d92](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a682d92d7defff9f18dff1988e291ffe6a99e0fa))
* **migration:** harden skip-detection verification ([e710595](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e710595275d79e0ac89a4577d6da9d0d82b0be6b)), closes [#464](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/464) [#462](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/462) [465/#462](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/462) [pre-#470](https://git.adorsys.de/pre-/issues/470) [pre-#470](https://git.adorsys.de/pre-/issues/470)
* **migration:** prevent silent re-run after success ([6c0621b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6c0621b675c7704ebac98bb7362345c906afac57)), closes [#463](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/463)
* **migration:** prevent silent re-run after success ([364be2a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/364be2af893465c673ee745f2ee9ea63e9e34020)), closes [#463](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/463)
* **migration:** recover pre-4.5.0 skipped migrations ([1af2d68](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1af2d6801053552072474c7233d1418e55cbd3b6)), closes [#475](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/475) [#463](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/463) [#463](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/463) [#475](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/475)
* **recurring:** prevent duplicate when manual transaction amount differs from template ([c17e7c8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c17e7c877883edda9c343fbdd87a474b8f412e40)), closes [#457](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/457)
* **server:** widen mockDeleteUser signature to satisfy spread in mock factory ([4ab3075](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4ab307582f43b06e50a70a801c428d04980a3e40))
* **test:** add tests ([ac200d4](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ac200d4c3ecea49cf0ee7853fb425545b6442e4c))
* **ui:** fix balance screen overlay alignment ([99f6e01](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/99f6e01bd38ba4528fa6e6facaf06f7541194f79))
* **ui:** fix balance screen overlay alignment ([3c310db](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/3c310dbfba6182d94b112d86b4480a1a5421eaea))


### Features

* **#446:** implement category visibility toggle ([e235888](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e23588878609b04799f74fde498e76ed1c55f38a)), closes [#446](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/446)
* **#446:** implement category visibility toggle ([5176c90](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5176c9017bdcb85a06e1207ba4066b6231d707dd)), closes [#446](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/446)
* **app:** add sentry crash reporting for android ([#442](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/442)) ([031f67f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/031f67f30702637d84b06a2dd328df824e940ad2))
* **app:** add sentry crash reporting for android ([#442](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/442)) ([d8a8a46](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d8a8a46e7af0bacbc0bbe7cf5df8d0f4c49fa000))
* **app:** show clear session-expired message on invite 401 ([6268753](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6268753de3905353d20b5602cecdd6342316b391))
* **app:** sign in instead of retry on expired-session sync error ([a59685f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a59685fc7a18adef0ca26e5ecaa3b96ca1191a6e))
* **migration:** delete default Personal account after successful offline migration ([dd39790](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/dd39790138d79129d86bdf2d66ba83d106a3ffae))
* **server/app:** sliding 30-day session expiration ([964fe16](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/964fe16bf55d5d51e5092388db8092efa91008b3))

## [4.5.4](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.5.3...v4.5.4) (2026-08-04)


### Bug Fixes

* **core:** send content-type on bodyless deletes ([a52c761](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a52c7617252a4dd6dae0fc5582ed8ce3835890c1))

## [4.5.3](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.5.2...v4.5.3) (2026-08-03)


### Bug Fixes

* **#440:** hide bottom nav on form routes to fix Android keyboard overlap ([f340bb8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f340bb80080842413a067a868573327c4bb5b215))
* **#440:** keep bottom nav pinned below the keyboard on Android instead of hiding it on route ([d9db140](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d9db140ece829c4dd4a559645c9b0fe3d74a1ee1)), closes [#440](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/440)
* **#440:** keep bottom nav pinned below the keyboard on Android instead of hiding it on route ([299d1f8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/299d1f86b3d23effb1244833c3006e1299110151)), closes [#440](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/440)
* **android:** scroll focused input above soft keyboard in forms ([898416b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/898416b824eb3955705e0fb57769959206777ec5))
* **android:** scroll focused input above soft keyboard in forms ([305cd32](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/305cd329fd7d0d988d216a98f164a4b63652d5e3))
* **app:** fix input visibility and onboarding layout on small screens ([feaad86](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/feaad86e8b21befa1d70368efeda4dcd5df6c246))
* **app:** resolve android keyboard resize and black band issue ([2639e9b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2639e9b50f080c4ada6f5f87b49d8e725abf62fe))
* revert splash screens ([6c34081](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6c34081cdba3f8b9974d00e05ddd7282f18bc2aa))

## [4.5.2](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.5.1...v4.5.2) (2026-07-30)


### Bug Fixes

* minor fix ([9cd38a7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9cd38a7f9c323d7b2c23b0433b149630f23b3290))
* minor fixes ([7aa8c60](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7aa8c602539c6f0c9b4223f475e570726074c9f8))


### Reverts

* Revert "date update" ([5733f32](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5733f32fc10517d8a1f72551b6bbd1fa8760cc25))

## [4.5.1](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.5.0...v4.5.1) (2026-07-30)


### Bug Fixes

* **invites:** persist recipient email encrypted so pending invites stay visible ([f7ba3f8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f7ba3f8e5164b3b94b67b896ba949faea415303a))
* **server:** use inline i18n email builders for all transactional emails ([46d554c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/46d554c8a88edc6765a88dc79638889eebca90a6))

# [4.5.0](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.4.0...v4.5.0) (2026-07-29)


### Bug Fixes

* **#421:** forward language to invite emails in migration path ([14e69e4](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/14e69e4c18c6e1711edf8e7ce688ed76a61a8898)), closes [#421](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/421)
* **#421:** remove hardcoded INVITE_TEMPLATE_ID default in compose.yaml ([96ce892](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/96ce89210f67bcde1aee673b2b8e21ae259b4837)), closes [#421](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/421)
* add all required iOS app icon sizes to asset catalog ([c57e7ab](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c57e7ab4685e4318df175f31e05fbacb778f7dbc))
* add option to skip in-app purchases review during submission ([3a99625](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/3a99625c7d89948f5526390ed4cc18b26a857be2))
* add retry mechanism for TestFlight and App Store uploads to handle network failures ([c209e07](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c209e073876b11bff12af9570d450280f885343b))
* **app:** sync state does not persist in account sharing UI ([24c97be](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/24c97beb72f91fc08072e9ad4715c2b5b92c41e7))
* disable precheck before submission to avoid IAP validation issues ([be7c485](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/be7c4852e1a9b009bf3f7d29d19357aa730b4be8))
* **feedback:** register missing Capacitor Device plugin for native builds ([56652e1](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/56652e1560378e684a683b959aed6a4fcec9f1f2))
* **i18n:** correct syntax error in language detection function ([4c9cac4](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4c9cac45781d9f9e678f288258352ff0facc8f5b))
* **i18n:** send invite email in app language ([#423](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/423)) ([8aeb2f8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8aeb2f828d1fb1e35dae90431beebdff83c2f201))
* **ios:** make AppIcon opaque (no alpha) for TestFlight compliance ([da31a26](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/da31a262d2a46ed03ea32528c4b47f53c8042a11))
* **ios:** strip 'v' prefix from app_version for App Store Connect ([c6637e8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c6637e8264ffd753098dbb28f90d44ed82c1c5a1))
* make Android legacy icons opaque (no alpha) for Play Store compliance ([a5974a2](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a5974a29e100191fca602b7696d4008c595be2f1))
* **migration:** accept UTC "Z" offset in Room date parsing and auto-recover skipped migrations ([73e8a45](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/73e8a45c93ba34db4db0c190e6b43bed2827664b))
* **migration:** recover skips from before the auto-retry marker existed ([02a798a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/02a798af5c00dbe816aab64c35efe9511b55d21d))
* pass language on resend in RegistrationCheckEmail ([9a8e947](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9a8e947053ac1c998fa402ad0b736e4042297313))
* **registration:** run preflight before register to prevent OTP on new device ([5304db9](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5304db900b036d5f018a029a7efb43f3215da80a))
* remove the support of ipad/apple_watch ([818e01d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/818e01dcd8c7c0596c73f826f04756eac775d9b9))
* removed skip precheck ([4e8ecbe](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4e8ecbeac50e319faad123c798b8924d6e0119df))
* reverted storyboard version and changed build number logic ([1a317cf](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1a317cf927c6a5e8f2b4b7347df59df0abe9e46d))
* skip precheck in upload_to_app_store (API key cannot validate IAPs) ([6386c2d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6386c2dd8321239e6e896df6d718cdc6348f6251))
* **test:** correct bilingual regex in SettingsMigrationCTA to match actual translation keys ([bab60da](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/bab60daa9b58085473cc916b68e6b6c3d4b064c9))
* **test:** fix remaining German-default integration test failures ([30aca05](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/30aca05ae4291b72f5fd778c3c0a975a4a52d5fd))
* **test:** force English in integration tests and fix onboarding E2E regex for German typo ([8e49dd9](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8e49dd9232caadf0e166de9c17bc3ec88319b37e))
* **test:** make integration test text assertions language-agnostic with bilingual regex ([f1c9878](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f1c9878f8b79a57db58349ac5ef7b3ed473c6021))
* **test:** mock react-i18next in SyncMigrationWizard tests to enforce English ([c010a2f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c010a2f62f209b057ce897f0227a05ef81bde260))
* **test:** use i18next default import instead of @/lib/i18n (no default export) ([aea5784](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/aea5784fe20b1e14910539db25ecd48b58f3fe6d))
* **test:** use testId assertions and bilingual regex to fix language-sensitive integration tests ([bfd9a19](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/bfd9a19a50f0f34d2975ca9e3c1f5cc42abc78a0))
* **ui:** keep transaction drawer visible when the keyboard opens on Android ([495be37](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/495be3732382e8b71dc3d9faa5005fc20bc84bec))
* **ui:** prevent sync indicator from overlaying header components ([fe4d47b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/fe4d47be5c5334a29c1f165e0103935b91de4272))
* update Main.storyboard format for Xcode 26.2 compatibility ([b5adce1](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b5adce13962eab88425795ea75a62fe558c143fd))
* use CI_COMMIT_TAG env var for version in tag pipelines (bypasses shallow clone tag issue) ([354afe5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/354afe5b8494addff1873b22060056c47b2d31c0))
* use CI_PIPELINE_ID for unique build numbers on retry ([a7fdc0c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a7fdc0cd86b1c144de8330985877d8c3e1298a2e))
* use timestamp-based build number to avoid duplicates on retry ([e579145](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e57914529119a68acb21774aa01ac1c47dfb1faa))


### Features

* **app:** add deutschland-preview.png asset ([02907aa](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/02907aafe27138ef83a23ed79768efb6062f3cf0))
* **app:** update UI with improved styles and add debug migration scenarios ([c06ac37](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c06ac376cfe23cca34cfe6305655ee2d3be741c6))
* **assets:** replace deutschland-preview.png with deutschland.webp for consistency ([0d9645b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0d9645b4c907f4888e7477d6771c6e912f49a805))
* **assets:** replace deutschland-preview.png with deutschland.webp for consistency ([601c4f1](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/601c4f1b056219c68ae0a6581cf7eef323a8586c))
* **core/app:** add CSV import support for legacy app exports ([d476d43](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d476d4345cdd4ea66ed6b2d362d4d1d987f6223a))
* **layout:** enhance layout responsiveness with grid and min-width adjustments ([02e56a6](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/02e56a6c05763cfea195bdbfa8b1c40ae30194d6))
* **onboarding:** enhance onboarding experience with updated language and add language toggle button ([e34a591](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e34a5913203bb0427b93ce1e779bd1c044d0737d))
* **onboarding:** update onboarding messages for clarity on registration and local usage ([026cfc9](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/026cfc9731c7ceed2c20b0c1c4bf27cb64881733))
* **onboarding:** update onboarding slides and migration messages for clarity ([d5b1261](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d5b1261e06bffa894d08e36b854115a6f6000ff2))
* **onboarding:** update onboarding slides and migration messages for clarity ([951c395](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/951c39522f4d37501e7058511bc429d949c2b79e))
* **onboarding:** update onboarding text for clarity and consistency ([52692c9](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/52692c9b17c9a6d48fa768957db3d2bb83728394))
* prioritize user-created categories in selection lists ([5651c95](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5651c95034fa4f8c7a32783c1bb01841679d6904))
* set German as default language on first launch ([#430](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/430)) ([d7b918f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d7b918fdfe8d4e3b4ddc06a6a2bfb7b6f60a270c))
* **theme:** implement theme management with localStorage support and event listeners ([a1b84b0](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a1b84b084f9244cce30c1419853d27a17da66998))


### Reverts

* Revert "Merge branch 'develop', remote-tracking branch 'origin' into bugfix/416-registration/signin-otp" ([b0a0f5f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b0a0f5fe203ec9b647d09d9f3e6e131775942ff3))
* restore SharingSettings files to develop baseline — unrelated to registration fix ([9aea84e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9aea84e21cc9880ffda21ad5c28aba1ccb5d6a4b))

# [4.4.0](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.3.0...v4.4.0) (2026-07-23)


### Bug Fixes

* **i18n:** normalize BCP-47 language tag and drop enum constraint ([#401](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/401)) ([c85817a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c85817a8676f9eb25d92c5d82f5a79c3501c3808))
* **i18n:** send authentication emails in the user's app language ([#401](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/401)) ([fe70016](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/fe70016e6f606ed292074bfb33c928f6ba6746ae))
* **migration:** added logs ([b75f288](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b75f288725b6432804d3a6e368ded9840f7d4060))
* **migration:** address reviewer comments on template-attach ([81c21a3](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/81c21a3d3e5622176a21fbd6a7ea85473605cf7d))
* **migration:** fall back to raw category name when no type-matched default exists ([0552444](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0552444c49778afb1871e24a565495db827064f1))
* **migration:** key attachPendingTemplates lookup by legacy account id ([6385437](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/638543739b78f8a19af4534f44576773506082df))
* **migration:** remove logs ([230429f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/230429f7c2585a3f6454df5fcdcd3e8ba89ed3d1))
* **migration:** remove the login condition to attach templates ([ffc5d17](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ffc5d175a4039aaf56624470399eb2232744036e))
* pass BREVO_SENDER_EMAIL/NAME to server container and allow empty MAGIC_LINK_TEMPLATE_ID ([d5fe1b3](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d5fe1b3c714a8eddde93f8c06986f549f5726e2f))
* **server:** add 5s timeout to recovery server fetch call ([5b4fc89](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5b4fc89ee617901b90747e3defb64aa3c4907ee2))
* **tests:** fix integration test failures after reviewer fixes ([b25738b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b25738b3743fc3b718ad742f5373058a52e1c3ed)), closes [#5](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/5)
* thread skipped/permanentSkips into MigrationResult; deduplicate template DB read ([be0022a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/be0022ae732b981f73a6fda1c7913adf23fd2f9d))


### Features

* **#408:** attach stashed templates during online migration ([82aa8c7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/82aa8c75445aade89cf2e48c9be5f48c5b64adf6)), closes [#408](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/408)
* **#408:** stash templates for online accounts during local migration ([6cb4101](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6cb4101fdbd7ab22cddd0d9637b3d3f8bf659237)), closes [#408](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/408)
* **recovery:** implement best-effort deletion of recovery entries on user account deletion ([890b3a0](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/890b3a01cbe7b60eb367d2856afb3cd57338fe5f))

# [4.3.0](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.2.2...v4.3.0) (2026-07-20)


### Bug Fixes

* add retry mechanism for TestFlight and App Store uploads to handle network failures ([ac9a837](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ac9a83709d5e71b46223d1307e896ebbcd1b3d14))
* quick fix ([d8d4af9](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d8d4af9e1de32b3ed7977a6eb066370c195ea90d))


### Features

* **migration:** add persistent template stash for online account migration ([7a1b5e8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7a1b5e86e0b2016dd5eb284a37a66b1e20ac5572))

## [4.2.2](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.2.1...v4.2.2) (2026-07-20)

## [4.2.1](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.2.0...v4.2.1) (2026-07-20)


### Bug Fixes

* disable precheck before submission to avoid IAP validation issues ([331763f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/331763f668c1488f68f4f77c33122f1270f438dc))

# [4.2.0](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.1.15...v4.2.0) (2026-07-20)


### Bug Fixes

* **#378:** prevent sign-in email from being sent on new device ([8565241](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8565241c962d7e53789ddcc875676d00a7ad1ecf)), closes [#378](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/378)
* add option to skip in-app purchases review during submission ([0f3e3e2](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0f3e3e2a0db51205e437fc2d220304e6e1153142))
* **app:** proxy legacy migration api to fix cors ([c50aecf](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c50aecfe160f47b6c57ce8406a2386aeca2b29ac)), closes [#359](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/359)
* **core:** add server mirror predicate and tests ([2d9e154](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2d9e15408e5c7a16b4117efce0124b18cb338326))
* **core:** exclude server-mirrored accounts from local import ([ea86bc9](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ea86bc9944c0cf4e480a26a057429682966e5096))
* **i18n:** translate 'Select an icon' label in German ([#402](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/402)) ([6782659](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6782659178cd50eb19e49ef9a3ca5eacc855cdbb))
* prevent account recovery from wiping local/unsynced data ([2b679ed](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2b679edb23d124b473f1f722b38940529843c2b4))
* quick fix ([e48c03f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e48c03f6b2a3f4e64dc4642ae86cab2dd5b18a37))
* rename export file prefix to mein-budget_export ([ae127e1](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ae127e1000ae781bba0b03a146c7f6ee013b1abd))
* update e2e test regex for About page branding ([d0d252a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d0d252a53032c7f43d3de46ea85bbc4496a2c48e))


### Features

* **#383:** update branding, privacy policy and imprint ([f1b40f7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f1b40f721e7487355bd6d9856111e9d6019944c6)), closes [#383](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/383)
* **383:** update privacy policy with full 10-section content (DE/EN) ([6a524f4](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6a524f4a835841ef9e93d633ee42d189bf3cf418))
* **app:** simplify feedback page and auto-collect device info ([e9ea6a8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e9ea6a8bedcafe089f0816cf75dc5478f96c23cd))

## [4.1.15](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.1.14...v4.1.15) (2026-07-16)


### Bug Fixes

* removed skip precheck ([cc44bf2](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/cc44bf2d02393debf9bfaa5777560674552d1682))

## [4.1.14](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.1.13...v4.1.14) (2026-07-16)


### Bug Fixes

* remove the support of ipad/apple_watch ([5e3a3a0](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5e3a3a017dc4cc3fbbd5f5c6db2e0864a1230866))
* reverted storyboard version and changed build number logic ([bc7a775](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/bc7a7750bc7fb50cc691abf4f318ffd2ce76a12c))

## [4.1.13](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.1.12...v4.1.13) (2026-07-16)


### Bug Fixes

* update Main.storyboard format for Xcode 26.2 compatibility ([01687dd](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/01687dd01f99cfe04cab99e6babef797bef6a84d))

## [4.1.12](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.1.11...v4.1.12) (2026-07-16)


### Bug Fixes

* skip precheck in upload_to_app_store (API key cannot validate IAPs) ([94ed4f7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/94ed4f7dc71c05db442a806530ee6fa4bdb62936))

## [4.1.11](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.1.10...v4.1.11) (2026-07-16)


### Bug Fixes

* use CI_PIPELINE_ID for unique build numbers on retry ([ee49133](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ee49133f87576ee7565591a750a8b94e58bd31cd))

## [4.1.10](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.1.9...v4.1.10) (2026-07-16)


### Bug Fixes

* add all required iOS app icon sizes to asset catalog ([b478f6c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b478f6c7569a8383c51b70a1ddc2d0f0592fb718))

## [4.1.9](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.1.8...v4.1.9) (2026-07-16)


### Bug Fixes

* use CI_COMMIT_TAG env var for version in tag pipelines (bypasses shallow clone tag issue) ([af8f82e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/af8f82eb87ef6219184c25319091a3c46bd6fdd6))

## [4.1.8](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.1.7...v4.1.8) (2026-07-15)

## [4.1.7](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.1.6...v4.1.7) (2026-07-15)


### Bug Fixes

* use timestamp-based build number to avoid duplicates on retry ([8ae5260](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8ae526023b75ef23609063c458ebe4b28e6cbbaa))

## [4.1.6](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.1.5...v4.1.6) (2026-07-15)


### Bug Fixes

* **ios:** strip 'v' prefix from app_version for App Store Connect ([f41e68e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f41e68e130cccd0d4753c218274200621c5e2400))

## [4.1.5](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.1.4...v4.1.5) (2026-07-15)

## [4.1.4](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.1.3...v4.1.4) (2026-07-15)


### Bug Fixes

* **ios:** make AppIcon opaque (no alpha) for TestFlight compliance ([0e833c7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0e833c79a7a59fe42d498c08125320d6a4efdfbd))
* make Android legacy icons opaque (no alpha) for Play Store compliance ([0eab631](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0eab631f9d75ce2b768da5d6dd009ac9ee31f454))

## [4.1.3](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.1.2...v4.1.3) (2026-07-15)


### Bug Fixes

* add a new lane to build apk ([c74541e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c74541ee5645fe7634fdc4026a20579d04555614))
* update release ([6ec849a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6ec849a50898e503378f5aa8e9789652e00f1310))

## [4.1.2](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.1.1...v4.1.2) (2026-07-15)


### Bug Fixes

* update online migration support end date and app name (DE/EN) ([541c345](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/541c345a38adf1a299bcb347090733c983a48a1e))

## [4.1.1](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v4.1.0...v4.1.1) (2026-07-15)


### Bug Fixes

* deploy:android:internal needs package:android:production artifact ([d13d20d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d13d20dd4a5277f24033e9b3884cda62cda60595))

## [3.11.3-qa.0](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v3.11.1...v3.11.3-qa.0) (2026-07-05)


### Bug Fixes

* move add-env-suffix hook to after:bump ([18b8fcd](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/18b8fcd86d1f76ced489ca18f4e3085120abd3c1))
* update deploy jobs and tag suffix script ([0e238f3](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0e238f3c2c657596fdc43a20f4673550c33e83c6))

## [3.11.1](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v3.11.0...v3.11.1) (2026-07-05)


### Bug Fixes

* convert script sections to heredoc syntax for GitLab CI compatibility ([03f9532](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/03f95325dab4aa3b6cefa2d6846b0e34c1710940))
* update release job to depend on build:mobile:production ([05cf417](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/05cf41755dcdbd8fefc210aacb23e77dcc932923))

# [3.11.0](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v3.9.0...v3.11.0) (2026-07-05)


### Bug Fixes

* **#287:** address snif review comments and fix sharing UI ([e065d06](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e065d0620ff2c5d440359adffb8a6b60f54a4e01))
* add default handler for /v1/invites/pending in MSW ([f5429a8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f5429a8c53763f6db58c71337f95acbb87dc60ec))
* add default handler for /v1/invites/pending in MSW ([f309c36](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f309c36d326467dff8f541969f4c9783028276e0))
* add diagnostic logging for pending key delivery investigation ([1ceb23e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1ceb23eb058f787f504d26ecf3f1cf24ba2da276))
* add diagnostic logging for pending key delivery investigation ([458f086](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/458f086cca249d32a7c68f67ebe91809b6bced5b))
* add existing key check to pending key delivery diagnostic ([effad14](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/effad1496db608fcad967b599abbfb494172e14a))
* add existing key check to pending key delivery diagnostic ([815d954](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/815d9542ff1c3d91eb54b151c868a3d3e983fd18))
* add maxLength to feedback message, fix app.test.ts env config ([01b8c7f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/01b8c7f102c5101d67eb93caf687ed65c1880e88))
* add missing corsOrigin to app test server config ([c7c99da](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c7c99da67eb9a7b71a6b7e19b7cfa7112e43ea9d))
* add missing executeCommand handlers for templates, recurring items, and savings goals ([8c6c833](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8c6c8333b8800e86651232e8f46116182ad53abe))
* add missing sharing methods to createMockOnlineAccountsClient ([1391a9e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1391a9e0943de4f3b863be52e41344723b03de7f))
* add MSW recovery handlers for integration tests with VITE_RECOVERY_SERVER_URL ([04427b6](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/04427b6a82e3a173bc46b91fe6e9c78326c43082))
* add MSW recovery handlers for integration tests with VITE_RECOVERY_SERVER_URL ([bf7c5fb](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/bf7c5fb9ad1de71ca013f5a69de245b752394a57))
* add qa branch to workflow rules to enable CI pipelines ([59cbb6a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/59cbb6a5db6e83e65a35673f9115099ee64eb284))
* add qa branch to workflow rules to enable CI pipelines ([6b92802](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6b92802c6d18111092dd387e5c923e0aa3c5d0f7))
* add QA deployment job to GitLab CI ([74ba8db](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/74ba8dbc17190c1a944dbdd55e75c27e5ee92040))
* add sslmode=require to constructed DATABASE_URL ([aa3d149](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/aa3d1492684346c441a611b646ecdec77363ee23))
* add sslmode=require to constructed DATABASE_URL ([14d63d7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/14d63d7675a7b738a2e5f08ee7badf9c1248b0cf))
* add VITE env vars to build, test:integration, and e2e jobs ([c149be4](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c149be4b2e0f84cd116777d9df749fd4f398b7cd))
* add VITE env vars to build, test:integration, and e2e jobs ([2fa9788](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2fa9788b3119c58bb75924f962080bf31868cdec))
* add wasm-unsafe-eval and API origins to CSP ([1cb6603](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1cb660371b94ad2044bcb43c9679f1e8d4e898b7))
* address all Snif feedback (keys implementation, missing icons, protected route) ([4557eea](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4557eea94c4e80ad7f17dc53ddcaa3472b797038))
* address MR review comments ([4849310](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/484931025b048acc571425c80294d70375424767))
* address reviewer and snif comments on sharing management MR ([36a1983](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/36a1983b71ef0923b1bf079eb2ce60218d02cf44))
* address reviewer comments for gate 5 e2e tests ([dc23f9a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/dc23f9a4ab8ce63e858ef6caa51e2426f6ac8a3f))
* address reviewer comments on feedback migration ([022e9cc](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/022e9ccd1312afd870b308a63041ef6ab7ef729d))
* address reviewer comments on sharing MR ([f13846d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f13846d7027c70841eaf867305dd18dbecbaa5e4))
* address reviewer feedback on sharing settings UI ([0445a8c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0445a8c9509ae729ec5e05404bc469805f3ae466))
* address snif code review findings ([69ebd42](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/69ebd423db58b35744301c2d5b0ab570df7cad3b))
* address snif code review findings ([8889141](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/888914139cc8554fa3efd9ee77e4e2ea922d4aa4))
* advance sync cursor after push to prevent re-pulling own records ([b183600](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b1836005d3e0fbb35161829c64ed23b60d5d373f))
* align CORS fallback in app.ts with env.ts production-safe defaults ([42a6fac](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/42a6facd57349efb52a26d71d9f5b6d20bfd80a8))
* align invite button with member card styling ([be6c7ef](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/be6c7ef2711de01b5d2bbc1b2a08ec0517a5b854))
* align plus icon in SharingSettings with app design language ([ec131e5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ec131e57d45c95bfbb31d6dcae8e59c95a1db080))
* aligned sharing settins UI  with app layout ([453518b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/453518bdf44df2c1260492a6066e9e3ee0ba6654))
* allow key re-delivery for revoked members in shared accounts ([05e4c03](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/05e4c03665ea14291013d10737efa58360e2ad30))
* allow key re-delivery for revoked members in shared accounts ([4b32f55](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4b32f55197f82b7452fa4072f3742e34f2921359))
* **android:** cast keystore master key to SecretKey ([77ecde5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/77ecde5a8c8241af50ba9e334d1af63add136398))
* **android:** cast keystore master key to SecretKey ([7234533](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7234533afa8ca6af21f571cd6faa22c0b9783992))
* **app:** bypass WKWebView CORS on iOS via CapacitorHttp ([8626d39](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8626d39d1d5507af853587f2de68eb24861bafb7))
* **app:** resolve vite config type mismatch ([b21e0e0](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b21e0e04499c520b7de366e43fb8994e4e51304f))
* **app:** use correct verification route in OTP screen ([b0fd0bf](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b0fd0bf4d0fe8f2c419b9107c4a4d7682b79b790))
* **app:** use correct verification route in OTP screen ([1afcdb8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1afcdb8c5bb65ee2b4d0c59e5cef36697307c500))
* backfill localAccountId in database migration and address reviewer comments ([2c99bd8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2c99bd86d25e47025b80ea949f7381f258ba32ad))
* change prod promotion to copy from QA instead of DEV ([94b70e6](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/94b70e696cf972a243766ad26a306361e2d52343))
* check navigator.clipboard directly instead of isSecureContext for copy fallback ([473604a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/473604a3943104e5c21bb7a180d1ef2877bd5568))
* check navigator.clipboard directly instead of isSecureContext for copy fallback ([6f6e978](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6f6e978703ad1009a8a55e47879502a50bb30b0c))
* **ci:** decouple coverage generation from test exit code ([ee73dc5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ee73dc5bef77ff5997cb3cfacffad093b50eef21))
* **ci:** output coverage to coverage/app/ to match CI glob pattern ([9659ef8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9659ef85c02e010f6c494fc216a1c4638c15321b))
* **ci:** output coverage to coverage/app/ to match CI glob pattern ([9485d72](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9485d7281896e87f6f0d3518ca3503ac4de39064))
* **ci:** replace nx affected with nx run-many to ensure all tasks are executed ([39a52e1](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/39a52e1a9a602d3e0d5cfee939e8394b7c63848e))
* **ci:** restrict ECR push to main branch only ([1110468](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/11104686bc8acbbf307c24f7fd22bdffd7c0da36))
* **ci:** skip playwright browser download during install to prevent timeout ([1832e0d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1832e0d4b77460b65a0d2e4cac30a107c918f8d7))
* **ci:** skip playwright browser download during install to prevent timeout ([42f3b84](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/42f3b84958955e7eb792c895692a077b7e39839f))
* cleanup legacy mock and sync with remote ([0376bc8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0376bc8be0cb0aa7547d92d2466c0e30a0ab400b))
* complete accessibility requirements for registration flow ([12c3910](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/12c391040fb30c411dadc71a6a8eda84715e3bd1))
* complete accessibility requirements for registration flow ([4983e7c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4983e7cb6cdbe4c8cebbae48cf019d09faaf3722))
* construct DATABASE_URL from individual env vars to handle special chars ([877d0fb](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/877d0fbecf485f4cb742baeff0d9ba5c0cf5e0ce))
* construct DATABASE_URL from individual env vars to handle special chars ([b2eb6df](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b2eb6df04e1b36e8b54986c3005db20d21ea3f98))
* **core:** add .js extensions to all relative imports for Node.js ESM compatibility ([7ae8050](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7ae8050a6f711cf8a66c3f7145ddf0d2152ae275))
* **core:** add defensive offline state checks during sync cycle ([16fb8ad](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/16fb8ad8267100da650aaff2756ad820f9638888))
* **core:** add missing index.js to constants import for ESM compatibility ([2212287](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/221228702a603aa74648594f0e8e60cad1fceb8c))
* **core:** correct envelope types export and clean stale build state in dockerfile ([40038d2](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/40038d20b2ac6d14bbbfaf546da79d4bc30738ec))
* **core:** correctly persist sync cursor lastSyncSequence ([e7ad364](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e7ad3640f2fbbfb4f259a4fa86e284d23dae228f))
* **core:** use Web Crypto API in generateSecretCode for browser compatibility ([475dffe](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/475dffeb8e519ac11763d3b1cca0f84a92964a32))
* **core:** wrap JSON.parse in normalizeCapacitorHttpBody with LegacyApiError ([2cb799b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2cb799bf352ad0adedd16293e5373f3e9ae71f26))
* deploy from dist/ not packages/app/dist (Vite outputs to root dist/) ([5ea4b7a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5ea4b7a9c497776d8f393da4e0bc6d5754b0a062))
* deploy from dist/ not packages/app/dist (Vite outputs to root dist/) ([5a0595f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5a0595fe30b6a49ebad7c1c413ceb1b50fe74872))
* disable SSL for local Docker test containers and update migration handling ([d3b12ab](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d3b12ab692ad7c80c0724abd046d393d64461d31))
* disable SSL for local Docker test containers and update migration handling ([826d30f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/826d30fd779ba94480cef86779046753b2c6a22b))
* disable SSL for local Docker test containers and update migration handling ([0129977](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/01299773e3513573ff105b6cc9bbd3f5d5f76662))
* disable SSL for local Docker test containers and update migration handling ([366125f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/366125fddb69e70ae371f5bcba3474e40541c5eb))
* **docker:** add drizzle/ directory and config to runtime images ([8c80a6a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8c80a6aaebae37954013d3cca98842cabe7cd5b1))
* **docker:** add drizzle/ directory and config to runtime images ([9ccb621](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9ccb6212f50a32b5c3721077da83fbeb4ca6b7d9))
* **docker:** re-include .husky/install.mjs in build context ([cb89324](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/cb89324291f37d8ddc097f7bd4184d4e7609b682))
* **e2e:** click on label instead of sr-only checkbox for WebKit compatibility ([d40ad60](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d40ad60ee259244d18218ebe96c5acfbbc9be124))
* **e2e:** click on label instead of sr-only checkbox for WebKit compatibility ([79150b3](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/79150b33b4dfca84df8c10aa7471c789bfad3bf8))
* **e2e:** use force:true for checkbox click to bypass overlay ([9fc3799](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9fc3799ef81a9d3610cb186dab06ccfe1739ec51))
* **e2e:** use force:true for checkbox click to bypass overlay ([4b2d953](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4b2d95332965b711632e25201f47b6f38b2ffb8b))
* finalize registration flow and routes for collaborative testing ([9528702](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/95287026a0175e54d37a020518c1b1a876dd82a1))
* finalize registration flow and routes for collaborative testing ([e8b632f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e8b632f94aa5225b861471e4e6d13881dd08c7c9))
* guard @capacitor/app for web and fix ensureSodium typo in getPublicKey ([0977d07](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0977d07f6688806683de542222ff7613e4de6966))
* guard @capacitor/app for web and fix ensureSodium typo in getPublicKey ([139c7fb](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/139c7fbebef62a3a13bfed83191b8cc1872b849a))
* handle fresh install and blank screen in local migration gate ([0993c57](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0993c57ab0b2bbcd64b6e8724b899c8c9be11534))
* handle nx non-zero exit in CI test job gracefully ([04b9ec4](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/04b9ec4e8a5719e94897f4cca7a65c759f42789a))
* implement missing UPDATE_CATEGORY handler in BudgetService and remove trailing whitespace ([5647f74](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5647f746507cdccdf898217e712eb282d59018e7))
* **ios:** Opt the iOS target into Designed for iPhone/iPad on Apple silicon Mac while keeping Mac Catalyst disabled. ([fb5073a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/fb5073a42decfce269c11789d3d5ab8241e27942))
* **ios:** put back some values after testing ([93a2ad9](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/93a2ad915078a6ddf45d3ce18f701087719db5fb))
* **ios:** put back some values after testing ([a8ca62e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a8ca62e31136f1285ad699b231801ed408ee72a7))
* **ios:** Treat empty native migration payloads as completed so fresh iOS/Android installs do not block on the local migration wizard. ([d3ab098](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d3ab098a709c92e1bc704d120c386e0034341e3b))
* make BudgetContext persistence test more tolerant to IndexedDB timing issues ([1e28d21](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1e28d216d2f0cee19c10e3884b2e7c5391024be9))
* make BudgetContext persistence test more tolerant to IndexedDB timing issues ([25bc7e6](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/25bc7e68cc4dacc037740a281e334bbb4e9fa227))
* **migration:** use native HTTP for legacy API on mobile ([f7d8a2d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f7d8a2d0efa338284afe230629f4a917a06e9854))
* minor fixes ([fe3dcd6](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/fe3dcd6a90f210b7420ff5e107606032a6b5c332))
* minor fixes ([127811c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/127811c61b64f2782a6fdd9dba12c3590deca317))
* minor fixes ([f6b69fc](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f6b69fc0c7a7a2a5f548b70f4ec95eb99970ecb5))
* persist pending key delivery state across refreshes and add server logging ([45dcd79](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/45dcd79f7571af0bdf064bda92a2d87f704464cd))
* persist pending key delivery state across refreshes and add server logging ([5795a7d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5795a7d55caf00cfb640237f603c6ab3d805549d))
* preserve crypto keys during logout to prevent sync errors on re-login ([106a329](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/106a329f3afeb7904618341fc7b02282650eae78))
* prevent duplicate pending invites with unique partial index and ON CONFLICT DO NOTHING ([a45cbdf](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a45cbdf583ea69005a17fe57cfaf0fc9470af464))
* recovery code screen first, success screen last, fix copy and navigation ([7752622](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7752622792157b18af76ec0ad42adfb5c11f8bfc))
* recovery code screen first, success screen last, fix copy and navigation ([7057179](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7057179a36a3e009ccaa5fa238882a81e679a420))
* **recovery-server:** address review findings — rate limit, wordlist duplicates, BREVO_API_KEY validation ([8c83463](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8c83463d4178ba266703f62425063c685e694fee))
* relax persistence test assertions - remove console error check and simplify data addition verification ([0e6c041](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0e6c041b66a64022cfbbc9d2608529ac71b565ce))
* relax persistence test assertions - remove console error check and simplify data addition verification ([ee47552](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ee475527ca9e94fa90079efd367049fb94ba8f23))
* remove debug VITE var checks and add MSW handlers for recovery tests ([2deaa68](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2deaa68f26c9e291c8dc7603e7c9dacf4d99b5b5))
* remove debug VITE var checks and add MSW handlers for recovery tests ([f3c1141](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f3c1141613f37a7766dc7605253b6d0b512ca17c))
* remove debug VITE var checks and add MSW handlers for recovery tests ([c866607](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c866607917da675fddb75f307c01458d796c7d76))
* remove debug VITE var checks and add MSW handlers for recovery tests ([d2410bd](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d2410bdd9629b5ce06f9b8cdc84c07e478615efd))
* remove duplicate Sharing Settings heading and unused PageHeader import ([19b3d9d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/19b3d9df1bd42ae446a5c5b611cbd379677a9d30))
* remove merge conflict markers from .gitlab-ci.yml ([22d5e6e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/22d5e6e2bfe754c31a9f216de28be4d2ba549837))
* remove QA dependency from prod promotion jobs to allow manual triggers ([f07c000](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f07c000469a096b098eeb7a0f9970e618cbbe9dd))
* reset environment URLs in CI to prevent integration tests from inheriting deployed variables ([70d3790](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/70d379097950468deeceebba63e1bfbe4c3f9bfe))
* reset environment URLs in CI to prevent integration tests from inheriting deployed variables ([e69a23b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e69a23b2a77b59013836f33dd3fa3a6be9d4cc8d))
* resolve core resolution issues and remove hardcoded API URLs ([eed2bfd](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/eed2bfd2326444f9a75201e17ddf456bae95b8a9))
* resolve core resolution issues and remove hardcoded API URLs ([0d6db6b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0d6db6b1ad83a64a57cacc751ad393d1ed9a93c7))
* resolve exhaustive command type check in tests and implement incremental sync cursor ([a020981](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a020981518ff6f05c0ff90a16c1b785b860e3c65))
* resolve TypeScript build errors ([e536798](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e536798695c56f2720d9fe3d23492744d05d2058))
* retry button in sync error uses goOnline when offline ([8a9e4e5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8a9e4e5123ca3a58b9fa1724ad4324e676c91e17))
* return correct structure for /v1/invites/pending MSW handler ([7ddd9bd](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7ddd9bd4cc96633f69265c48a31cd125382c5b95))
* return correct structure for /v1/invites/pending MSW handler ([a350a5a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a350a5a4cc0c524852a2d37be78dda29a26ecfd8))
* rollback vite.config.ts to main as requested by reviewer ([df26a15](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/df26a15e639ba8c70b43fc0223c8d2c491b5ad63))
* secure registration flow, native deep links, and migration cleanup ([dbab702](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/dbab702ad584132862d1cfe2180df25a37993191))
* secure registration flow, native deep links, and migration cleanup ([6e7436f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6e7436f2f7196010c6b3bbafe326b3a1b51591cb))
* **security:** additional security fixes from snif review ([602b5ef](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/602b5ef13fc01e7a6f068e268cf4ef5f31741f6b))
* **security:** additional security fixes from snif review ([e12c5f7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e12c5f72a9c7b395f2c58589a0ee761a84633b94))
* **security:** address snif security review findings ([111477d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/111477d07caeb8ff97e28a0833d726ae7a2688d7))
* **security:** address snif security review findings ([9d77a25](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9d77a259633ca0cc3bd139c59e5aaef8afcfb0e7))
* **security:** remove plaintext email and OTP from production logs ([86145e0](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/86145e0328c8b758b349428904593b8b5e54da02))
* server build failures and registration regressions ([1a6e94e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1a6e94e05f321e5a83055c4e4007c49d1010ab6c))
* server build failures and registration regressions ([4c7ae38](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4c7ae3844b6f548a382208b183c4a1d454ed579e))
* **server:** add missing @sinclair/typebox dependency ([dbf0d29](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/dbf0d2944c4c7f0493932b99bcb921da73efff6f))
* **server:** add redirect page to work around Brevo click tracking ([a2b9de5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a2b9de5e7804488749c65229a94a32d7509089f8))
* **server:** enable Brevo email delivery for registration flow ([d5a4a8b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d5a4a8b5b157ba88efb43328f52ebf3165077c6a))
* **server:** enable Brevo email delivery for registration flow ([397eefd](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/397eefd0b3dadcef8f7efbea5744bc429c155d70))
* **server:** resolve reviewer comments on buildServer defaults and auth tests ([fc1de69](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/fc1de69f6e96a68caf10310aecbda1241a31746c))
* **server:** update test helpers and app tests for new buildServer signature ([c4f310e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c4f310ec6550d9183fbefba85517cbc2a78bbf75))
* **server:** update test helpers and app tests for new buildServer signature ([a4b5c0d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a4b5c0d81cc2c4ae4744031a55175c5b770a5ef0))
* sharing settings retry button uses goOnline when offline ([27b0499](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/27b0499ce32d93aaa4d05623db13738666ad7889))
* simplify BudgetContext persistence test to focus on core functionality ([dfd3e0e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/dfd3e0e6e7727bc1d4030c47f08fcfb382dbef18))
* simplify BudgetContext persistence test to focus on core functionality ([00382b1](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/00382b19882b28a903dbac8d5c1b751699c4adb7))
* stub API env vars in integration test setup for MSW interception ([6e43f91](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6e43f9136f6688152f9433d6797db58864e62777))
* stub API env vars in integration test setup for MSW interception ([1664aab](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1664aab7da846983cb494fa1f0ab581a9bfb400a))
* stub MAGIC_LINK_TEMPLATE_ID in auth test for CI consistency ([7c31cc0](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7c31cc0b8f484277d91ea06493f25807ba8d780f))
* **sync:** address Snif performance and security findings ([88d4f35](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/88d4f35c1fa86c1538f1d556b1f59c2c4b510656))
* **sync:** defer upload queue cleanup until sync cycle completes ([7acd27d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7acd27d837d38379a5d4bae93ecd539d91e5d2ed))
* **sync:** resolve type conflicts and test regressions in unit tests ([a9ada8e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a9ada8e3373fbaeac7423b591cb381c5af084a08))
* **test:** add missing OnlineAccountsClient methods to recovery-replay fake client ([464d888](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/464d888a847bc47e14b0091ad74adede85cfe06a))
* **test:** resolve migration file paths relative to test file, not CWD ([7d37b21](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7d37b21ca5390a517719314d9a0d3bb162f25e40))
* **test:** run server tests in node environment to fix argon2 failures in app:test ([d7c3778](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d7c3778ce152271ba52dc6e73547d1fb7992153d))
* update email templates and environment variables for Mein Budget branding ([af393a8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/af393a8b45279780a13a9e7506a6fc2ebb55c9dc))
* update email templates and environment variables for Mein Budget branding ([4f68d6a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4f68d6abac8d152d7771b8cff6a734ad98b96437))
* update feedback integration test to use /v1/feedback instead of Formspree ([e2d6a04](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e2d6a040e4f0bc392befe1358c644cc1b22dd106))
* update QA deployment job to use Cloudflare Pages URL and trigger on qa branch ([e244738](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e2447389be3063343e8fb6f953f8c3c87fd92e93))
* update schema test to use correct migration file ([909d5d8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/909d5d87463cee2e469267db94c6eb8e37f49cbd))
* update schema test to use correct migration file ([f167b88](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f167b882185dbf3ea2af230ef5a00873f318ab92))
* update test assertions for new error messages ([b326db9](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b326db9a9b98c8e8beea313df1221591598ba922))
* update test assertions for new error messages ([1abe35e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1abe35ec64bd9c72f0091736e71d9ca8ce001263))
* update tests for registration-to-sync changes and fix nested button a11y ([263f846](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/263f8466e4e54a304e0aa9049241fa3cb9a117a6))
* use correct accountKeys columns in diagnostic query ([a3b61c8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a3b61c8946041944b3e9547aa63f34a3f9ec8135))
* use correct accountKeys columns in diagnostic query ([f541cdb](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f541cdb570c0cc2df99167009074a06963656d7e))
* use RegExp URL patterns for MSW recovery handlers ([59cc450](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/59cc4501989733f3930207a810e5876e1e153586))
* use RegExp URL patterns for MSW recovery handlers ([aa22095](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/aa22095b83db5a4e088099f19a35c47ff1e9c6b5))
* use update-then-insert for key re-delivery instead of onConflictDoUpdate ([5466877](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/546687723468fb5c8e2b9fe1c59cb495a44281fa))
* use update-then-insert for key re-delivery instead of onConflictDoUpdate ([178fad7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/178fad7053cc6cf28adfa5bda78bc90b0466cffa))
* use update-then-insert for key re-delivery instead of onConflictDoUpdate ([74864e8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/74864e88093ed926b9f9a71fc023d033d786384e))
* use update-then-insert for key re-delivery instead of onConflictDoUpdate ([97a6058](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/97a6058ff7c53a56b671e743993638fb83595bfe))
* use UTC log timestamps and fix CI test job double-execution ([f285e6e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f285e6e61d12a5a17eb6c67de2ad8207dc2e441d))


### Features

* **#278:** encrypt ChangeRecords before upload ([e002416](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e002416fd5afb03c2cdcbc01f87adf801264a940)), closes [#278](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/278)
* **#288:** pending invite notification + accept/decline UI ([b691a24](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b691a24f495d2f84ed7c365aa030c69d1280f1f3)), closes [#288](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/288)
* Account Recovery UI Flow ([2a72ba4](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2a72ba4cda46f42242f0dba146052bb483d2de74))
* **account-keys:** implement account creation and key management functions ([a2e119b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a2e119b47be71ec588b1888f484ca4250e8fa1e6))
* **account-sync:** implement account key lifecycle and sync metadata management ([e94449e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e94449e8d8e5717b166f9e1701da90aba027d3d0))
* **accounts:** add account sync metadata and routes for account management ([06c70fe](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/06c70fe350db197b9b61c3aa1ccd592a998d7683))
* **accounts:** add account sync metadata and routes for account management ([04676ca](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/04676ca4f382fb654eed4eb7885fd39acc41d150))
* add CORS_ORIGIN env var for explicit origin allowlist ([2dea4c5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2dea4c5563e4c6bbdde64bc653c75428ab827367))
* add prod image promotion jobs to GitLab CI ([7ac2663](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7ac2663e6981c1e454dd3c1978be068f974de7d6))
* add QA deployment stage to CI pipeline ([d263ed8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d263ed8936366088112f6f38f0998790b85a0bcc))
* add recovery server configuration to prod infrastructure ([2f1ee26](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2f1ee26f9fb2c7f38930c101abc613646b58b02a))
* add role-based sync logic to improve key delivery handling ([1ab7549](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1ab75495ad9071b69f174e0b31fd74c52ffbd692))
* add role-based sync logic to improve key delivery handling ([d1d152a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d1d152aa2b97a3baaa62d51cdbf22efb05167443))
* add VITE env vars for dev backend URLs in CI build ([558b938](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/558b9387ad8cde6bbf2605f2e1fd802b6a183290))
* add VITE env vars for dev backend URLs in CI build ([6975bde](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6975bde88d01f460402b59f6b41c0e24a52e8e75))
* **app:** display native export destinations ([#299](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/299)) ([4896647](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4896647fb0add0030d623ff55fa58d50e2be0e60))
* **app:** update online mode toggle and first-time online feature prompt ([878c199](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/878c199648cd40ece8c8330b644bab878000c72a))
* **auth:** enhance JWT handling for magic link and session tokens ([c718cf7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c718cf71929a6fe531cd4d457a9bc4e57eaf9cac))
* **auth:** enhance logout process and session handling for registered users ([e0724b3](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e0724b3f4d47625d82cdc94bec96d31e5a6efcb9))
* **auth:** store user email for sharing self-invite checks and improve client configuration ([f990fa1](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f990fa110b50df557c03ac131af095693109e887))
* **auth:** store user email for sharing self-invite checks and improve client configuration ([8480e56](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8480e565559788d0d2c4d5c74ec13f48be89e5fe))
* **auth:** store user email for sharing self-invite checks and improve client configuration ([a12a2b5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a12a2b576aada26f7d436012c622d650911cf6bf))
* **auth:** update magic link template handling and refine RecoveryCodeScreen styles ([b2752ed](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b2752edf77f6189a3563620345abae008923c01c))
* **auth:** update magic link template handling and refine RecoveryCodeScreen styles ([caca12c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/caca12ce13f5c19c3ebc170fd82201dc50888d83))
* **auth:** update magic link template handling and refine RecoveryCodeScreen styles ([7655d0a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7655d0a54ff1c64d3033b82fc312e708c94d150b))
* **auth:** update magic link template handling and refine RecoveryCodeScreen styles ([e539029](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e53902941911b7a34c9a577edf70d908aebedc40))
* **auth:** update magic link template handling and refine RecoveryCodeScreen styles ([f3b38e6](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f3b38e65ea09c76b06f311c6bb238ce56c54491c))
* **auth:** update magic link template handling and refine RecoveryCodeScreen styles ([adb8ecf](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/adb8ecf7934fc2b8a1b873970f1acfea51ebd7ba))
* **budget:** enhance offline mode handling for registered users and improve UI responsiveness ([f101ab1](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f101ab14c126340d7f3e24f7794a71926064128e))
* **budget:** load account key during sync to enhance budget handling in both online and offline modes ([93a6c61](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/93a6c61cf2e207dae99bfae7a3dcb4b39ff69810))
* **ci:** add ECR push job for server image ([aafdbc0](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/aafdbc09a4aac6b83ede7c00ff248623a6682647))
* **ci:** update SNIF version and model configurations ([1af1fdc](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1af1fdcd98eb6c4606653e0f016400e9e9723777))
* **client:** finalize sync status indicator and engine integration ([05d1ed7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/05d1ed713226ae2afa7dacbbf55cf357f5112f2a))
* **core:** detect legacy online accounts in migration ([8fda36f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8fda36f785f0cd7b9a36cd9c16b68c8fe61bebe0))
* **database:** add encrypted sync account tables and change records ([c772d86](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c772d860b74c5b2350274e6738d243593a227578))
* **database:** add encrypted sync account tables and change records ([1ce2ceb](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1ce2ceba9fc6001a9568dde547cecd3bf964099c))
* enhance key delivery handling by improving account provisioning logic ([b64d6ff](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b64d6ff23034c8b65bb72d2c7239ac85bafec960))
* enhance key delivery handling by improving account provisioning logic ([4362e2e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4362e2ed8fe5abf2b3d450b22c32056b6cc3b8c0))
* enhance key delivery process with improved result handling and UI feedback ([443279d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/443279d7a9e4394f4d6498db76cdd31672d2c618))
* enhance key delivery process with improved result handling and UI feedback ([1983647](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/19836472c7847025cd28c14fca35a9984d103e2c))
* finalize registration flow and connect to production backend ([86961ff](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/86961ff5cd2e43ac6d2a0f59894d91f3ebed0b9e))
* finalize registration flow and connect to production backend ([d27fd18](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d27fd18a442457f4e64e13ae575fb8679f5ea3e6))
* implement account key delivery for invite-accept workflow ([6c984f4](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6c984f4badeffeab72e04d1c49bd931a0ced2669))
* implement client registration UI flow with email validation and OTP mocking ([9a17f5d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9a17f5d7ed93a01e8019ec84271abffbfcc6b72f))
* implement client registration UI flow with email validation and OTP mocking ([bf36eaf](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/bf36eaf5ea3198fb10aebd3a128da40feeef572c))
* implement encrypted push of migrated legacy ChangeRecords to online server ([390598c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/390598c44e05261f634a6ad888ecfa5244a6f578))
* implement multi-account key cache and update encryption logic ([b0f282e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b0f282e30a0413ab671bc4d26ce18cefb3920b29))
* implement multi-account key cache and update encryption logic ([fb6a508](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/fb6a508dbf9f5e6293e1f4eeb6096627813c03bb))
* implement sync status indicator UI and sync engine foundation ([cab5f43](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/cab5f43bd6e5a65e58afb7f5d17080ff3a53d5a2))
* migrate feedback system from Formspree to backend email service ([996f609](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/996f6093aeaff4129dc7aa96ccf68f5f2a4b1f48))
* **migration:** add LegacyMemberMigrationService for legacy shared-account member migration ([9824817](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/98248170728b223829419a461cb67f6d6754f76a))
* **migration:** ensure upload queue is cleared after successful migration push ([17394eb](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/17394eb0a6cfff844f74a0d50b2a3015409021d4))
* **package:** add crypto envelope import and update devDependencies ([47dff06](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/47dff067a85f759416dd3a44343797060512ee46))
* **package:** update db:migrate script to check for DATABASE_URL and RECOVERY_DB_URL ([f7b72d2](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f7b72d29e9753091f93651ffa87d59c98103769e))
* **package:** update db:migrate script to check for DATABASE_URL and RECOVERY_DB_URL ([d441e8b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d441e8bf271c46a405962256b6c4d51869ebd29a))
* **package:** update db:migrate script to check for DATABASE_URL and RECOVERY_DB_URL ([8c45532](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8c455322e2677db4b9294ce97e94659c082c84c4))
* **package:** update db:migrate script to check for DATABASE_URL and RECOVERY_DB_URL ([470d2c5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/470d2c58702ffe0bf0cf6d3a4b6f07662e1a460d))
* **private-key-store:** add PrivateKeyStorePlugin to project configuration ([c138120](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c138120a4d2778cdd6b7728b60e6178b7948fea0))
* **private-key-store:** add PrivateKeyStorePlugin to project configuration ([ba3bdf6](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ba3bdf67176a48317e00a4ba638a25aaedb29cd7))
* **private-key-store:** add PrivateKeyStorePlugin to project configuration ([394a66f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/394a66ff34025680734b3af7be55d72cf4950ad0))
* **recovery:** enroll endpoint, secret code generator, and UI screen ([e287b03](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e287b0375e15bba7269aeaca00d4bb002e6eef3d))
* revoke accepted invites when removing members and prevent owner removal ([6e34252](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6e34252cb7d07cfe880860c17883bc81ff438062))
* revoke accepted invites when removing members and prevent owner removal ([b8ef832](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b8ef8323666d66e048d8e2fe0ff418fa0892f813))
* **schema:** rename migration file and create initial schema with account and user tables ([4907bd9](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4907bd950c832ca987ef704ea83148fb21074dfa))
* secure registration flow with server-side hashing, client key generation, and web fallback for PrivateKeyStore ([d861d82](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d861d829384758b75415ab98fe635dc043f1a11e))
* secure registration flow with server-side hashing, client key generation, and web fallback for PrivateKeyStore ([09e8778](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/09e8778e8d5c180d3dc67a8f295e463ec1531efb))
* **server:** add encrypted change record relay ([6fa76b5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6fa76b50412ce55b0d4b6b8d40c108b2e48460fe))
* **server:** add shared account schema ([5e51da5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5e51da5eae4937d1d86e069c5c81de4f95b15d37))
* **server:** member removal + accountKey epoch rotation ([ad16548](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ad165488f354ba69936eaa28d1718b52afacd44e))
* **server:** registration endpoint + magic-link verification [#265](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/265) ([36016c5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/36016c5564631320718449cdb2af70d65a57a275))
* **session:** add session authentication and helper functions for nonce handling ([9a99cec](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9a99cec169c8592d7e6f176e1cd41eb12530cc2a))
* **sharing:** implementation of per-account sharing management UI and logic ([229c1cf](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/229c1cf567c9032b58f990717e532dc7c6e35e59))
* support dynamic DB name overrides in recovery server ([c003ead](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c003eadef4e8d07aed504a96139f2c050bc717ff))
* support dynamic DB name overrides in recovery server ([f392a54](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f392a5498747f0be01cacd22332092f9fa0d0379))
* **sync:** add goOnline functionality to toggle accounts online and refine offline mode handling ([fd0c7eb](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/fd0c7eba62f14e24171b04ff9b92e5c43ab73548))
* **sync:** add goOnline functionality to toggle accounts online and refine offline mode handling ([2a38421](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2a3842156efa770900af9267552d2fb40cc8d9db))
* **sync:** handle account deletion during sync and improve error management ([ac0cb47](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ac0cb47dd5181fc71f638885102e6270305ad38f))
* **sync:** handle account deletion during sync and improve error management ([dc5d5fe](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/dc5d5fe184fe0fdcde9076b44ac31e9a71bb6c3d))
* **sync:** handle account deletion during sync and improve error management ([bd0f193](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/bd0f193865dd934f2ab626158b626b705e42e07a))
* **sync:** implement recovery replay for restored account synchronization ([4a901df](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4a901df6668b8381812fabb9d96c6ce7adedfa06))
* **test:** add Gate 7 E2E test for shared-account member migration ([809ab2e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/809ab2e178bd11915d47b58e06219e24950b2dbc))
* **ux:** refine terminology to sign in/out and polish onboarding layout ([a40ff29](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a40ff29ca0bb0cd82db825dfacd4775d2138de76))
* **ux:** refine terminology to sign in/out and polish onboarding layout ([62353a3](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/62353a33ab878ca798be2c4737d66c47bd200936))


### Reverts

* Revert "fix: preserve crypto keys during logout to prevent sync errors on re-login" ([2557948](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2557948977e55076628f34070838512f7a7ec7ff))
* remove mock-based gate5 test script — manual E2E needs real legacy stack ([5397133](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5397133257a136892d594b557970ecece2ba6a12))

# [3.10.0](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v3.9.0...v3.10.0) (2026-06-09)


### Bug Fixes

* add missing executeCommand handlers for templates, recurring items, and savings goals ([8c6c833](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8c6c8333b8800e86651232e8f46116182ad53abe))
* advance sync cursor after push to prevent re-pulling own records ([b183600](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b1836005d3e0fbb35161829c64ed23b60d5d373f))
* **android:** cast keystore master key to SecretKey ([77ecde5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/77ecde5a8c8241af50ba9e334d1af63add136398))
* **android:** cast keystore master key to SecretKey ([7234533](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7234533afa8ca6af21f571cd6faa22c0b9783992))
* backfill localAccountId in database migration and address reviewer comments ([2c99bd8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2c99bd86d25e47025b80ea949f7381f258ba32ad))
* **core:** add defensive offline state checks during sync cycle ([16fb8ad](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/16fb8ad8267100da650aaff2756ad820f9638888))
* **core:** correctly persist sync cursor lastSyncSequence ([e7ad364](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e7ad3640f2fbbfb4f259a4fa86e284d23dae228f))
* **core:** use Web Crypto API in generateSecretCode for browser compatibility ([475dffe](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/475dffeb8e519ac11763d3b1cca0f84a92964a32))
* **core:** wrap JSON.parse in normalizeCapacitorHttpBody with LegacyApiError ([2cb799b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2cb799bf352ad0adedd16293e5373f3e9ae71f26))
* handle fresh install and blank screen in local migration gate ([0993c57](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0993c57ab0b2bbcd64b6e8724b899c8c9be11534))
* implement missing UPDATE_CATEGORY handler in BudgetService and remove trailing whitespace ([5647f74](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5647f746507cdccdf898217e712eb282d59018e7))
* **ios:** Opt the iOS target into Designed for iPhone/iPad on Apple silicon Mac while keeping Mac Catalyst disabled. ([fb5073a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/fb5073a42decfce269c11789d3d5ab8241e27942))
* **ios:** put back some values after testing ([93a2ad9](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/93a2ad915078a6ddf45d3ce18f701087719db5fb))
* **ios:** put back some values after testing ([a8ca62e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a8ca62e31136f1285ad699b231801ed408ee72a7))
* **ios:** Treat empty native migration payloads as completed so fresh iOS/Android installs do not block on the local migration wizard. ([d3ab098](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d3ab098a709c92e1bc704d120c386e0034341e3b))
* **migration:** use native HTTP for legacy API on mobile ([f7d8a2d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f7d8a2d0efa338284afe230629f4a917a06e9854))
* **recovery-server:** address review findings — rate limit, wordlist duplicates, BREVO_API_KEY validation ([8c83463](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8c83463d4178ba266703f62425063c685e694fee))
* resolve exhaustive command type check in tests and implement incremental sync cursor ([a020981](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a020981518ff6f05c0ff90a16c1b785b860e3c65))
* **sync:** address Snif performance and security findings ([88d4f35](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/88d4f35c1fa86c1538f1d556b1f59c2c4b510656))
* **sync:** defer upload queue cleanup until sync cycle completes ([7acd27d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7acd27d837d38379a5d4bae93ecd539d91e5d2ed))
* **sync:** resolve type conflicts and test regressions in unit tests ([a9ada8e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a9ada8e3373fbaeac7423b591cb381c5af084a08))


### Features

* **#278:** encrypt ChangeRecords before upload ([e002416](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e002416fd5afb03c2cdcbc01f87adf801264a940)), closes [#278](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/278)
* **account-keys:** implement account creation and key management functions ([a2e119b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a2e119b47be71ec588b1888f484ca4250e8fa1e6))
* **account-sync:** implement account key lifecycle and sync metadata management ([e94449e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e94449e8d8e5717b166f9e1701da90aba027d3d0))
* **accounts:** add account sync metadata and routes for account management ([06c70fe](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/06c70fe350db197b9b61c3aa1ccd592a998d7683))
* **accounts:** add account sync metadata and routes for account management ([04676ca](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/04676ca4f382fb654eed4eb7885fd39acc41d150))
* **auth:** enhance JWT handling for magic link and session tokens ([c718cf7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c718cf71929a6fe531cd4d457a9bc4e57eaf9cac))
* **ci:** update SNIF version and model configurations ([1af1fdc](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1af1fdcd98eb6c4606653e0f016400e9e9723777))
* **client:** finalize sync status indicator and engine integration ([05d1ed7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/05d1ed713226ae2afa7dacbbf55cf357f5112f2a))
* **database:** add encrypted sync account tables and change records ([c772d86](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c772d860b74c5b2350274e6738d243593a227578))
* **database:** add encrypted sync account tables and change records ([1ce2ceb](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1ce2ceba9fc6001a9568dde547cecd3bf964099c))
* implement sync status indicator UI and sync engine foundation ([cab5f43](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/cab5f43bd6e5a65e58afb7f5d17080ff3a53d5a2))
* **package:** add crypto envelope import and update devDependencies ([47dff06](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/47dff067a85f759416dd3a44343797060512ee46))
* **package:** update db:migrate script to check for DATABASE_URL and RECOVERY_DB_URL ([f7b72d2](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f7b72d29e9753091f93651ffa87d59c98103769e))
* **package:** update db:migrate script to check for DATABASE_URL and RECOVERY_DB_URL ([d441e8b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d441e8bf271c46a405962256b6c4d51869ebd29a))
* **package:** update db:migrate script to check for DATABASE_URL and RECOVERY_DB_URL ([8c45532](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8c455322e2677db4b9294ce97e94659c082c84c4))
* **package:** update db:migrate script to check for DATABASE_URL and RECOVERY_DB_URL ([470d2c5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/470d2c58702ffe0bf0cf6d3a4b6f07662e1a460d))
* **private-key-store:** add PrivateKeyStorePlugin to project configuration ([c138120](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c138120a4d2778cdd6b7728b60e6178b7948fea0))
* **private-key-store:** add PrivateKeyStorePlugin to project configuration ([ba3bdf6](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ba3bdf67176a48317e00a4ba638a25aaedb29cd7))
* **private-key-store:** add PrivateKeyStorePlugin to project configuration ([394a66f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/394a66ff34025680734b3af7be55d72cf4950ad0))
* **recovery:** enroll endpoint, secret code generator, and UI screen ([e287b03](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e287b0375e15bba7269aeaca00d4bb002e6eef3d))
* **server:** add encrypted change record relay ([6fa76b5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6fa76b50412ce55b0d4b6b8d40c108b2e48460fe))
* **server:** add shared account schema ([5e51da5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5e51da5eae4937d1d86e069c5c81de4f95b15d37))
* **server:** member removal + accountKey epoch rotation ([ad16548](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ad165488f354ba69936eaa28d1718b52afacd44e))
* **server:** registration endpoint + magic-link verification [#265](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/265) ([36016c5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/36016c5564631320718449cdb2af70d65a57a275))
* **session:** add session authentication and helper functions for nonce handling ([9a99cec](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9a99cec169c8592d7e6f176e1cd41eb12530cc2a))

# [3.9.0](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v3.8.0...v3.9.0) (2026-05-29)


### Bug Fixes

* **android:** cast keystore master key to SecretKey ([b1a17f4](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b1a17f49f06138c712b53686f4666dbb158909f9))
* **core:** address envelope.ts code review feedback ([d6356ba](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d6356ba2d62bd91e3c57c2ff39d1662545fdf61c))
* regenerate pnpm-lock.yaml after merge conflicts ([64e42ba](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/64e42bad5ee347fe63c1454de3c76e7f161a6920))
* regenerate pnpm-lock.yaml after merge conflicts ([fe9fe64](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/fe9fe644c274bc9e6455343d3f4454629f7c0598))


### Features

* **core:** add EncryptedEnvelope contract with libsodium wiring ([0bd1cce](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0bd1cce97cd14c9f49b9a38a8ae6b0216a88a915))

# [3.8.0](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v3.7.0...v3.8.0) (2026-05-28)


### Bug Fixes

* **app:** fix category delete button positioning in grid ([d014990](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d0149903c84d35057de49270b630926668bc6b35))
* **app:** scope notifications to current account ([48808f7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/48808f762abc247cfff561958e57c978b784d522))
* centralized page titles, restored centered date picker in Limits, and stabilized E2E tests ([54ac792](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/54ac79295decbb510850e857611d4f54cba15fcc))
* **ci:** skip playwright browser downloads during install ([b7656c8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b7656c84c3649c971691b0993894df5079809a64))
* **core:** clear token in finally block and expose clearToken on ILegacyApiClient ([8d76bf3](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8d76bf3c0cdfcb22ba4eee02db30313170b2942d))
* **core:** fetch data for all owned accounts in fetchUserData ([7bf95ba](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7bf95babd0dbc3e2b2d85189f728a9438bb7f9bd))
* **core:** handle 400 as INVALID_CREDENTIALS on /user/get-token ([b8d5402](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b8d54027b63f55d23b2b8ee20afa3413460802b7))
* **core:** harden keypair storage and fix sodium init hazard ([4536d5c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4536d5cd28722cf579d5a2acd31b3854afeac8f7))
* **core:** separate warnings from fatal errors in MigrationResult ([58c1f2a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/58c1f2a841fce7fde86e00a03ae5d934ce721737))
* **core:** throw NOT_FOUND when user has no account access in fetchUserData ([b3878a7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b3878a7c17549fd449c594717e0fadce00f970ef))
* **e2e:** add waits for IndexedDB persistence in settings tests ([5122245](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5122245de1b913231cf804cf40924877f9e492b0))
* exhaustive navigation logic in Layout and satisfying legacy E2E menu selector ([1518c2d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1518c2dffa3a818822ac938898ac16c6f85eb478))
* finalize UI alignment, background colors, and test stabilization ([a5c7ded](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a5c7ded9eff49900138dbd934424de0b50104cc8))
* fix pipeline ([679be1d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/679be1dfaea6f5534c07f62914e03b4a3770535a))
* fix PR comments ([a7c84c7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a7c84c7fc5cb726037602ffd9b76e16f19315798))
* fix PR comments ([5945766](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/594576693792e166eab4b98db7e07b8d5442ef2b))
* fix PR comments and refactor project strucuture ([2823098](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2823098c072f698a92b874a1681c31d87422ec2e))
* hide inconsistent empty state message when future transactions are present ([725100f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/725100f92d0bba976557e9743fae79010a00cb72))
* **i18n:** restore savings goal delete label and missing delete icon on goal cards ([47a4b76](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/47a4b76c7af5e2a919a03abaf4a3fa4f8105ca5a))
* incorrect transaction display when applying filters in Balance view ([3d4ae01](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/3d4ae014ea05f79e2d538df00267c4902eee75f8))
* **ios:** align core data setup plugin name ([a963e81](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a963e81956c30879df676808421010e70f4ac45b))
* **migration:** address code review findings in LegacyDataTransformer ([278301b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/278301bd463ed8dabd7d7fa8264ce5a2e8801000))
* **migration:** address code review findings in LegacyDataTransformer ([2897818](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/28978186f314281e188779fb782082343f95c3bc))
* **migration:** address local migration review feedback ([919fc49](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/919fc491614b37c1b04826842654822d0d649809))
* **migration:** addressed user account transfromation issues curently all user account are transfromed except the ones marked with delete true ([0063807](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0063807bd14293fda6249e14944983bfb77504bd))
* **migration:** Fix Android Room migration incorrectly preserving raw legacy category names for categories that match a default category ([d1f324d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d1f324d0e39fbf7a943cb554d2a063182a53aac5))
* **migration:** Fix Android Room migration incorrectly preserving raw legacy category names for categories that match a default category ([c7f2692](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c7f26927a23ea6e3700383f3905e341804e9132c))
* **migration:** fix tests ([f657ec5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f657ec55728ec5fd81dea232629c31aa655d31a2))
* **migration:** fix tests ([e7b088a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e7b088a889c7cedd9d30bc49135422539796411b))
* **migration:** resolve integration test failures and fix Snif-dev typo ([9855afa](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9855afaef6da4da4999ef30b0be77b7d5fedec96))
* **migration:** resolve reccuring items duplication issues during import ([8a5d7af](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8a5d7afa0e244da73f0e5d310376cd482cf112f3))
* rename files to avoid confusion between the two migration ([71bb8e4](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/71bb8e49f38564cce176be39ed6bb3fc03628385))
* restore card navigation and test IDs to fix E2E regressions ([3800850](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/380085010590f369d4e3a776f8fdc0bf8a6516bb))
* restore dynamic category-chip test IDs for integration tests ([1310cd8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1310cd80a625b9455a26c86494a8ab1e23d0c803))
* route-aware page titles in Layout to satisfy E2E assertions for Categories and Limits ([e960aeb](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e960aeb40ebb6604898a7e3ee30b9f3391ea3760))
* **server:** address backend foundation review feedback ([7eab666](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7eab66613e6714304205ed2bedf57714b2e23a1c))
* **server:** ensure NO_COLOR environment variable is unset in dev scripts ([26d5757](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/26d57575582b0c5f519acf5b2bb8cf4ff926431c))
* **server:** ensure NO_COLOR environment variable is unset in dev scripts ([52c45d1](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/52c45d1bf0f37eb96b486a3318004c6b68bd0496))
* **server:** make database and package metadata lifecycle explicit ([0dbdb41](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0dbdb41b318c2e9770c0bd425edb25df742adad8))
* small ([64a1222](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/64a12222f0c89af5c606c685fe3a920343acadca))
* small fix ([b21e545](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b21e545535b670d51fe1999e62749ba40b979e16))
* small fix ([c162686](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c162686bd11bf9925887ed73521ac1009824ad4b))
* small fix ([0c2543f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0c2543f27d6ad64ef380a8f14480fe063682afa0))
* small fix ([a9ca84d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a9ca84d87259d277dc102c3a6dd183763291a29a))
* small fix the indexedb has no auto category ([693594b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/693594b8017e4663ccfa979aa577ee500506ab1f))
* stabilize category management E2E tests by migrating to Dialog and fixing test IDs ([8de284e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8de284e4aa5e0fd05c4e8b51a5b62e1de2f4f57c))
* standardized UI headers, updated delete buttons, and fixed unit tests for detail pages ([4dec983](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4dec983b9623b0747dafc6e58a2496e869fa6319))
* **tests:** resolve AddGoalCard test regressions ([d2f3782](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d2f3782bbe4e5cc094a5d72f049de8035d4a7c20))
* **tests:** resolve regressions in Layout and Settings tests ([ed1e2dc](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ed1e2dc41be2cb10eb020d761d28054aff9e5105))
* **tests:** update amounts in tests to reflect decimal euros instead of centimes ([87b562d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/87b562de70460b7b530902b4ec640e7be1f9654e))
* **tests:** update amounts in tests to reflect decimal euros instead of centimes ([0fa5d5a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0fa5d5ad1508b4e351e21bd679f0b90cae30e0b8))
* **ui:** remove question mark from delete limit, add sidebar borders, and restore header consistency ([259c629](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/259c6297ac9311900e2ad2f9670d5903dca5e3d0))
* update integration test to match new category-chip test IDs ([6a5e78f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6a5e78fce2c60b75090311e198d04ef664b2a81f))


### Features

* add @capacitor-community/sqlite dependency to package.json ([84d6f5e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/84d6f5ed788706d8ff271595df6978b1e879ae5d))
* add edge case migration fixtures and mock HTTP utilities for comprehensive integration testing ([2619613](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/26196130f433ba2da52e201c81c2d6e18fe99076))
* add MainBridgeViewController to register MigrationSetupPlugin in iOS bridge ([4e2798e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4e2798e861ff6e13523eee05fae5504c6cc72ee8))
* add migration test support utilities and fixtures for improved test coverage ([7007524](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7007524cc624f415a3910cdd93ee81edd0771b5c))
* add migration test support utilities and integration fixtures for enhanced test coverage ([9687273](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/96872732418dd395c53dcace56e68c467f322481))
* add minimal account migration fixture for comprehensive integration testing ([6e54f3c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6e54f3cbd7a00ccdb18c2f2220f50d1692063bf5))
* add multi-account migration fixture and handlers for integration testing ([252370d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/252370d047b4c2ae80c0085124356c97077afd92))
* add RealmSmoke component to validate iOS Realm bridge and TypeScript migration integration ([97a4d24](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/97a4d24cc95dc5fca131812cef64e053ef21526b))
* add support for Realm smoke test route, enhance iOS test configurations, and update migration utilities ([b85f45a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b85f45ae3c9df09103cd716188acbbbf7df109fc))
* add support for Realm smoke test route, enhance iOS test configurations, and update migration utilities with new transaction type mappings ([e7d1b70](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e7d1b70d4c98af39b70cc9e0b855125e7c4c4480))
* **android:** add @capacitor/preferences plugin to build dependencies ([baf68c3](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/baf68c3b47ee5bec467542d00c939439dd600084))
* **app:** implement multi-step migration wizard UI ([66f52e5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/66f52e58ba6af01f78eb993d438798b2d58ed96d))
* **app:** improve version display and refine email translation labels ([786d78e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/786d78e8c85c7d82015d6e3fe87b1fa07980b492))
* **app:** redesign migration banners and update tests for clarity and 2026 support timeline ([237e6fd](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/237e6fdcfcca02f557bccfab6a3af59ffd4f6c10))
* **app:** update import banners and localization for legacy app support ending in 2026 ([9e15f3c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9e15f3c3ad4cce543b499628baa7c017a21c0e9f))
* configure CapacitorSQLite settings and enforce read-only migration rules ([5fb249a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5fb249acc864e996058d3203460a14a9975b19ae))
* **core, ios:** update migration logic for legacy category and iOS database handling ([2c4383b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2c4383b5fa1e7f4f74877fb9a926290f759c5b1c))
* **core:** add `ios-coredata-reader` for Core Data migration and comprehensive test coverage ([2dda868](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2dda8688fd50e7553a0b3434789f241b02789545))
* **core:** add `legacy-category-mapping` module for handling legacy categories and transaction types during migration ([5c2de78](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5c2de78619aff2552f671bd265271122ed19941d))
* **core:** add `legacyIdToUuid` util for converting legacy IDs using UUID v5 ([ee7ec3a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ee7ec3a2f18702f3f1b0ccdd5fe8d3a0df715cba))
* **core:** add devGlobals helper to expose db and migration utilities for testing ([cb709ce](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/cb709ceea9d6546454295949e2d43fe9001328b9))
* **core:** add Dexie import layer with atomic FK-ordered integrity checks ([48625b6](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/48625b695531089596ff93ac3369d146f5a0a42c))
* **core:** add LegacyTemplate and LegacyLimit types with API availability notes ([5b130b7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5b130b7164ac0ae4ff565abd567c4c00214458e4))
* **core:** add LegacyTransaction alias and ticket-spec method wrappers ([447209e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/447209e9179d9643380370425516897ac749624d))
* **core:** add local-payload-importer and its tests for migration handling ([459bfeb](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/459bfeb61d0e0fdbaf2ab98918ca3c72272ee976))
* **core:** add local-payload-importer and its tests for migration handling ([23fda36](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/23fda36fa918dd5776783a07796e1f0a5605c05c))
* **core:** add local-payload-importer and its tests for migration handling ([c6ee16e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c6ee16e533473d664857e529c36b19b95d68daa4))
* **core:** add migration orchestrator, LocalMigrationGate, and test helpers ([00e451f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/00e451f40dda13ec535b63c5eba54754b93b2709))
* **core:** add migration result factory helpers to simplify testing and data creation ([3c1d71a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/3c1d71a3d39634db593408709e9f41f12c090405))
* **core:** add migration result factory helpers to simplify testing and data creation ([b1e3b68](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b1e3b6880209ce671662c67c58758c3c6e86befe))
* **core:** add retry with exponential backoff for network failures ([558d201](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/558d201c1d55dd0d67ab7b9c5922e24af6527f7a))
* **core:** add X25519 keypair generation and hardware-backed key storage ([752290b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/752290b1384a0ab9aa5a096a5d880c56ae544fc2))
* **core:** android file-copy shim, Room/SQLite query layer and tests ([696a9f1](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/696a9f13726bb062db86f4ce28a88f0ea507b83b))
* **core:** implement LegacyDataTransformer for legacy → domain mapping ([32f832b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/32f832b18b32713bce4b7878330af8a54d4414bf))
* **core:** implement LegacyDataTransformer for legacy → domain mapping ([7bf10c5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7bf10c5d0908beea4456312d9284cfa3b4ed6b67))
* **core:** implement LegacyDataTransformer for legacy → domain mapping ([c8c4e7e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c8c4e7eb6ba3a59ba24e75d0dd031ab955668eb7))
* **core:** implement typed LegacyApiClient for Django API ([6539cdc](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6539cdcdfd03cec76ce81efde96c0178c0af27d1))
* **core:** include confirmed member (shared) accounts in fetchUserData ([6efd042](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6efd0428e6757ff788eefdbe01334f4027a2a02c))
* **core:** include limits in LegacyUserData extracted from categories ([3320fe0](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/3320fe05dd57570930c8836b34690aac34d4e45d))
* **core:** update types and tests against live API contract ([5196c34](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5196c34e62a89b80b9c51b3cefd7f47dc5cd71c2))
* **db:** add users table and unvalidated-registration cleanup job ([29c546e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/29c546e4871346a4289de4c08461d6eb8b313c00))
* **deps:** add @capacitor/preferences to dependencies in package.json ([5d2f94c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5d2f94c5faa35e84c38f108f2f336134e8495499))
* enhance connection retrieval to handle errors and manage reference count ([378338b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/378338b1c792e87ee594c2cda69588b9dfe0673d))
* enhance migration service with additional integration tests and robust error handling ([32827f2](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/32827f205ea12c91734df877dd97eb34f0c04b15))
* enhance queryReadOnly to manage connection lifecycle and preserve existing connections ([b88a476](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b88a476c6ffea096f1531af58dc1466c07860b39))
* enhance vitest configuration for integration testing ([c43541f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c43541fb677a8e56303eea27534d2c54b48526c6))
* export iOS migration utilities to enable core data migration functionality ([352ad13](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/352ad134ca5e369bc651c7368f35057d21c0c713))
* finalize everything white UI standardization and fix test regressions ([3ed3909](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/3ed39098730349693551c6b4227f47074dc5e8a1))
* finalize requested reverts and fixes for Categories and Limits while maintaining premium white UI ([347983a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/347983a78153a87bc6c4b0d4a3c20feef87359f1))
* implement promise-based locking for concurrent SQLite connection creation ([b552746](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b552746549197a985ef87279d467b7fdf64b6644))
* implement reference counting for SQLite connections to manage lifecycle and reuse ([4266840](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/42668406b873a17ffb396906def4cf04f9365aed))
* implement reference counting for SQLite connections to manage lifecycle and reuse ([91e6a1f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/91e6a1f4cfb145da558dc45b9c64a23e0f1c7062))
* implement SQLite connection module with read-only access and query support ([dc003f7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/dc003f7653fc4e41198b09a0330eab946d75931d))
* improve database deletion handling and add malformed response tests ([0283563](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/028356328d000234f9835f058b2de6a4a16d2bf3))
* improve database deletion handling and add malformed response tests ([b779e3f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b779e3f072c5a88ecbb88faa7202e20d7a9a1d35))
* improve error handling in connection creation by adjusting reference count ([eb94c7c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/eb94c7c654c3b94fd65ecb570401176ffd97b79a))
* integrate Realm models rework and add RealmSwift package dependency ([361ede8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/361ede8152f6421deffbf7dc0d5cea7f6b495926))
* **ios:** add @capacitor/preferences to iOS dependencies and extend Window interface with migration helper ([34bc0f7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/34bc0f7b91e1b15a3848a037afac38936615c212))
* **ios:** add @capacitor/preferences to iOS dependencies and extend Window interface with migration helper ([ac73261](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ac73261b74536c4136095261aadf1587121819f6))
* **ios:** add `MigrationSetupPlugin` with `prepareiOSDatabases` and integrate into `MainBridgeViewController` for Core Data migration setup ([a1e9ce7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a1e9ce78a0fc49cc4fac8601461d7352b3d22c33))
* **ios:** add `prepareiOSDatabases` function to handle iOS database setup during migration ([348b6ae](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/348b6ae0a0a94f3ac66c2d543c63d9cc9ddb0b52))
* **ios:** add Core Data smoke test for iOS with database seeding script and UI integration ([4dad794](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4dad794262481befbd35ff6de89cbe130ce56a87))
* **ios:** add V1 Core Data schema tests and enhance migration with legacy date parsing, limits, categories, and transactions ([e154a30](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e154a3064f327ca187eb4127eb67973fcc9f16f1))
* **ios:** enhance Core Data error handling and logging for malformed rows and dates ([db8385c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/db8385cf588563894c1f2a7a83c10c659dacac10))
* **ios:** enhance Core Data migration with legacy limits deserialization and error handling ([cb10825](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/cb1082587b68ef36cbfaa80d77e64ccd0512d9e0))
* **ios:** extend Core Data migration with legacy date parsing and limits support including error handling ([9797608](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/979760855aca07981a224b0dbffcdcc0f47c999c))
* **ios:** extend Core Data migration with V1 schema support and refactor category and transaction mapping logic ([38b4c1e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/38b4c1ee00ff4dcfd897a038523eca1d1a958b2e))
* **ios:** implement Core Data database connection and query handling with migration setup ([3a39ee6](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/3a39ee63fe4702bfcd5d73756a950d43b7743e55))
* **migration:** add some utils functions to transform data into our Dexie types ([316c9ad](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/316c9ad7f362a76e3fa1be914e90b3d73697623a))
* **migration:** add some utils functions to transform data into our Dexie types ([d58455f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d58455ffe81312ca650ad74b978e824d3c71cd31))
* **migration:** add some utils functions to transform data into our Dexie types ([d133687](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d133687c490eb46e43a3d24e0741149a7e2eebff))
* **migration:** add validation data schema ([902673d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/902673d152c1ef26dd77e1ec761c6ac60cd3e20f))
* **migration:** add validation data schema ([d63f355](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d63f35590f28341eff751f1ba2707419eeee4864))
* **migration:** define unified JSON contract and Dexie schema types ([4372b61](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4372b61f5f01653a2dbcd90b3bd2649038a77e29))
* **migration:** error handling, rollback verification, and user messaging ([af9e013](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/af9e0136a83c990d2b81986a877333bad6e96537))
* **migration:** error handling, rollback verification, and user messaging ([7140785](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/71407859346fbf04b6e5ea628b1ab8d87784f249))
* **migration:** error handling, rollback verification, and user messaging ([15d933f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/15d933f8eab277736205c9fb2d8ac4d259a4531a))
* **migration:** finalize migration flow with auth fixes and CI stability ([1d95d5d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1d95d5df5314adafbe1437b470eef728cb36b5f3))
* pnpm cap sync and remove confused npm lock ([a5cc8b3](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a5cc8b36570a48e93628306b1ca5541535b104f0))
* **server:** add initial backend foundation with configuration, health check, and build setup ([e7aaa67](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e7aaa671216ce5899bfbee3a236b34b7c3c9fc2f))
* **server:** add initial backend foundation with configuration, health check, and build setup ([869a3db](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/869a3db8158cd2a0f7ebfecbe04c68d8980efa4c))
* **server:** add initial backend foundation with configuration, health check, and build setup ([c63d95d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c63d95d62e516d8ec69d9014c6bf6399af99dfea))
* **server:** add replay protection middleware ([3334411](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/3334411e7cb8400edbd0592d920f071609b7a761))
* **server:** add replay protection middleware ([17c9f6a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/17c9f6ad9296abcc746f1f74d9bdf3a36b18231a))
* **server:** extract nonce handling to reusable module and improve replay protection ([aa8def5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/aa8def5807b6589fd4f546c39d96305ca5af9bcb))
* **server:** extract nonce handling to reusable module and improve replay protection ([fde0c2b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/fde0c2ba70995bdb9885e34c8684548865beadfd))
* update `.snif.json` with new models and indexing config, enhance CI with SQLite checks and cache key adjustment ([ca480b0](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ca480b097c142bd05ef3ed3977de00a337de6b3e))
* update openReadOnly to return connection result and creation status ([c9c5c07](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c9c5c07b309d6e08dd68661d1cfe68a462527d0d))
* update Package.resolved with new dependencies for SQLCipher and ZIPFoundation ([e8c8f71](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e8c8f71ca3bd6f5ffe9d0ca870aa34c09fda0708))
* update Package.resolved with new dependencies for SQLCipher and ZIPFoundation ([abc041c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/abc041cc31d35704c61dfdd813654d850102e129))


### Performance Improvements

* **core:** deduplicate category IDs before fetching saving goals ([7b91354](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7b91354e564f9c449b697c7509aaee0c3250bba4))

# [3.7.0](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v3.6.0...v3.7.0) (2026-04-16)


### Bug Fixes

* add missing Family and Children category mappings and remove focus state from categories page ([2ee002a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2ee002a6a723236d9d7488a2d571ec598c265c6f))
* address all critical code review issues in BudgetService ([f60b2e9](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f60b2e90c295f203551e0d404afaa0a4e6ffbbfb))
* address all critical code review issues in BudgetService ([98a70a7](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/98a70a706685a74b24dd78c0728cd8777cd8785c))
* address all critical code review issues in BudgetService ([453a62f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/453a62f0f590b2d33e51fbb824351a1aa90b36f2))
* address all critical code review issues in BudgetService ([9a9676c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9a9676cc77327c3f218c13fc5c4acacd925f5ea1))
* address all critical code review issues in BudgetService ([0691c67](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0691c675458973bb1a9ff3c657d4b78a9f79bf59))
* address final review feedback on CSS and test selectors ([7b45435](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7b454358920bf4d269c8cd47b06cf3962bcc571a))
* **app:** address final code review points for safety and cache consistency ([364317f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/364317f638ae4c3b68c3f34ab3cfd56eec14d08e))
* **app:** exclude pending transactions from income and expense calculations ([4ce8011](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4ce80112f2dc87ebe5bc03cb1837ee3169a4fda1))
* **app:** refine recurring transaction deduplication with title and category ([391a958](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/391a958a46700739f0756ddffdbb31bf93053095))
* **app:** resolve recurring transaction duplication on overview page ([9f89b7d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9f89b7dc6e09e5e62e5489b50a3c1e0df766752d))
* **app:** resolve transaction duplication on dashboard and fix E2E failure ([0f348b2](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0f348b2bbaeaec4c0ecc5d4bec811c3025c140f1))
* **category-ui:** remove dots icon, eliminate category button focus states, and fix recurring date logic month-end case ([c868948](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c868948b7c255b7aca78b04aa2fc99741e054610))
* **dashboard:** finalize reverts and minimal test fixes ([5d0f649](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5d0f6497da662dd3ec7a0beef8e52c022d28f395))
* display recurring tag for current month transactions created from Overview page ([6855d9e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6855d9eacf2101dc8a16dbbec0bb9190713f052f))
* fix test ([9773eca](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9773eca2fadc7e4f7e6e8b279cfaa667ff7b4410))
* improve BudgetService documentation clarity ([365cc7c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/365cc7cefae9d030dc02389e921d074f9272a626))
* improve BudgetService documentation clarity ([953e637](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/953e63768c88210c0cbfb90d1db65cc87dee0e49))
* improve BudgetService documentation clarity ([492fa05](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/492fa0501fb6610f823368d8967fe77a421ed736))
* improve BudgetService documentation clarity and fix timezone test issue ([13139bd](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/13139bd95f67212ac2c67af8cb0b4188678813ce))
* improve pending transaction filtering, sorting, and UI ([cc9ba96](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/cc9ba96f6223ee414889b880bb0728666b7fd199))
* make recurring tag blue and clickable like original design ([e5be3ac](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e5be3ac7cd42925111c5673b53c03453d8c1e4f9))
* make recurring tag less prominent in pending transactions ([ff5c704](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ff5c70412812ecc0d7e454e4ea57caaca1db2db3))
* minor changes ([93c6b6f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/93c6b6fdcc7e525f7accf9810a70267388737273))
* minor changes ([ee73d3d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ee73d3d8482127bbe1940f57d87a47d7e7d3fc1f))
* minor changes ([5b9e481](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5b9e481d2b29f04cf1995f8d68dd2877f93cfa32))
* minor changes ([bead7bd](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/bead7bd8cd54c21000f2607be2d3272906f48a1a))
* minor changes ([4eb5dea](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4eb5dead836f19b329d6aff9a95bfc909208d0a2))
* minor fix ([551d9c0](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/551d9c0d08a503b4f974954a30cc8347b65b7d97))
* remove recurring tag from general transaction list ([c6fe96a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c6fe96a82f7a7dace33def09c71e7e9f0abcac2e))
* resolve pipeline failures and address Snif-dev review on categoryKey handling ([3e1df72](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/3e1df726ae6778c0861fc6fc5cc0d61a460b36ba))
* resolve pipeline failures by aligning component colors and accessibility attributes with tests ([d583794](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d5837947f0a1e9f21d0a0bd7fdfcc7af63c3f32f))
* resolve recurring transaction date offset and display issues ([08911b8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/08911b8cf0f3bf1f9f150a469cb5f29dd1e40db6))
* resolve recurring transaction date offset caused by UTC conversion ([e170331](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e17033162b0fc9dd847405f8476b6dd2f52d830c))
* resolve recurring transaction date offset issue ([fb613e2](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/fb613e2d67bf3e3905a5fd2d751d856b6da32f1d))
* restore focus indicator on CategoryChip for accessibility ([013f241](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/013f241d16b8989fbb0041aa9dbf93d35d7c8df3))
* separate upcoming and confirmed transactions in dashboard and fix recurring logic range ([5fa7e9e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5fa7e9e3d8ca8af0b77c2dd551c6088b2bac37e0))
* show pending transactions in current month and fix all test failures ([f1f5f70](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f1f5f703887a0fce603828a40e9053bf7634d3fc))
* **test:** failing transaction test ([236a8ff](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/236a8ffe32ee48f4a6c43b404ba6ec31c71625f3))
* **tests:** align TransactionForm tests with new UI labels and date logic ([b56d2da](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b56d2dace5a579cc74fa2dab482b743c8d1d6f28))
* **tests:** restore fallback letter logic and update color assertions for category chips ([ae27bcb](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ae27bcb776528bdce58f024f2638303b3d87432d))
* **ui:** use muted color for recurring indicator and fix amount alignment ([641fd4b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/641fd4b9f1e750d89a2cd1ab19bdc801d0c44aa6))
* update review and summary model to qwen3p6-plus in .snif.json ([3316910](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/33169103f4dac67744d3eaaa872116bcd826768e))


### Features

* add keypad to make next payment page (child issue 199) ([21454a8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/21454a8b3f9935a6f0ff469310b2d6fde243d7f1))
* **core:** implement BudgetService facade for write operations & command logging ([26a2bc9](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/26a2bc9ef979d1c01f45d692ed8b0b9710e4b9b8)), closes [#223](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/223)
* **core:** implement MigrationService orchestrator ([cda0ea0](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/cda0ea09ca042e5e27a5e4af025e53cee4cb9bc6))
* Display recurring items in overview page as future pending transactions ([b784fd5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b784fd5bed999034127f5cd11001982d4fe1f2b9))
* implement Command-Based Change Capture for write operations; introduce BudgetService as a facade to standardize and log all mutations; prepare for Phase 2 encrypted sync ([6cb8d46](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6cb8d46f0fa07835d718b87e32908120e9d16f44))
* implement single-category selection in balance filter ([f074876](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f0748764a7d411bbbd77ca4764f015bafd73b57e))
* standardize filter drawer UI and improve dark mode visibility ([9f19c9d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9f19c9db8609fcf31d8e5304d775653d4baa281f))


### Performance Improvements

* **app:** optimize recurring transaction deduplication with Set lookup ([7ca8891](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/7ca8891315e28d9f02af71b0827cf5853a156d0f))


### Reverts

* restore recurring tag to clickable blue styling ([a467db4](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a467db43a48e564839d84ee2ade3da38f8a8d1a1))

# [3.6.0](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v3.5.0...v3.6.0) (2026-04-02)


### Bug Fixes

* **app:** contain action buttons within dashed wrapper on large screens ([9f99375](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9f99375c97122bf982921c8de442e1615987a61c))
* **ci:** use os-aware sed flag in sync-versions script ( [#189](https://git.adorsys.de/dip/budget-wise-pwa-now/issues/189)) ([89c841c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/89c841c8dee97a9c83f9d0bedf40d6d4c76373e9))
* **e2e:** stabilize feedback success test and improve success dialog accessibility ([a7d9b15](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a7d9b1505467568b4c910f01939b526b3de2763b))
* **feedback:** update message content and fix integration test date logic ([c35d852](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c35d852434a4aed906447b16c40b7dbc6929f37a))
* improve text contrast in dark mode for recurring items and template form ([083318a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/083318a4856173ed3930ecc7ebccd452dc966fd1))
* **onboarding:** update account creation copy to be account-agnostic ([1db1709](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1db17090804090be6af904a9353cdd7ffa3f3ddc))
* **onboarding:** update account creation copy to be account-agnostic ([be10b79](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/be10b79fc1ed5a2639f63957638c04e0604b6a8b))
* update account initials when name is changed in profile settings ([1c1ace5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1c1ace5f04f0632f099bfe0bbe76289b7a5f7e35))
* use node:slim image for test:integration to match .nx-setup anchor ([bfd862b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/bfd862bee331cfd9aa9b30e29e1612b2bea20b6a))


### Features

* add "Balance" page with transaction filtering, grouping by month, and future transaction overview; update translations and sidebar menu ([cf36458](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/cf364582dd263d403b40453967484626f1dde6ab))
* add support for expanded default categories with version 3 database migration and update category presets, icons, and translations ([3271810](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/3271810d4777916f206ad4a5dd109d889d453c7a))
* add transaction editing functionality to "Balance" page with inline drawer and form integration ([aac1c36](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/aac1c36359f5ef94aaa13aee3258d8f50085c18b))
* **app:** add recurring payment option to transaction form ([73a5f87](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/73a5f8703b8f1ee6df8f9b56c7b5ac876ce5ea2a))
* enhance "Balance" page with advanced filters, search functionality, time periods, and category selection; update translations ([62e9bde](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/62e9bde66dbbf8a62867ea52dcd97eee246c5416))
* enhance "Balance" page with advanced filters, search functionality, time periods, and category selection; update translations ([af44975](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/af44975be8fe44774c13d4ec1e896c491af1afa4))
* improve CI/CD pipeline by optimizing test execution with parallelization and adjusting Playwright worker settings ([b00b9f0](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b00b9f0c3279fa19ff51023c454bca97999f13c1))
* refactor "Balance" page to improve modularity and performance; implement lazy loading, enhanced transaction grouping, and enhanced filter initialization; update translations and UI interactions ([23b8837](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/23b8837f4673707b7268be60592a12ae2e85e90b))
* standardize category chips and amount display in forms ([9b07f38](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9b07f38411f8839516c545466a390d930455aaaf))
* **ui:** redesign date picker dialog — light & dark mode polish ([6346aa2](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6346aa260aa84f8b22b017b285d0687a34df0b53))
* update dependencies and add new packages ([9fba49f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9fba49f3bb53d5654eeaa43e8eb0af6020a2ba96))
* update statistics page to improve savings rate calculation, enhance category display and improved date navigation on the balance tab ([89f0721](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/89f072190fdbd7d5ed06d9d1e02924fc2f8c6c0d))
* update statistics page to improve savings rate calculation, enhance category display and improved date navigation on the balance tab ([dbc1f75](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/dbc1f7523cc5e90055b97aab8becbd70a6dd7891))


### Reverts

* Revert "pipeline testing" ([c402fd2](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c402fd21e525a23597fe7d0ee1a85211212fa6aa))

# [3.5.0](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v1.1.43...v3.5.0) (2026-03-19)


### Bug Fixes

* **app:** correct savings rate calculation in payment screen ([049b86c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/049b86cd0df43a31fc8d137edc948167a2ec004e))
* calculateSavingsGoalEndDate() / calculateSavingsGoalEndDateAsDate() computes a dynamic date based on today + remaining payment months — it ignores the stored goal.deadline ([9ed5762](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/9ed576234565bfe241a5d4f5bf3dc57495120990))
* **ci:** override sast parent job to resolve stage validation error ([c69b534](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c69b5347725603a11825257909911a6f2b10d347))
* export import bar from setting ([1d21fa6](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/1d21fa63811d10484a70b89f0d1ff5773fa0cf4d))
* export import bar from setting ([34f5e4b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/34f5e4bd3f9d43655cc2fcf58ca510ba356f9504))
* export import bar from setting ([2c4f9b2](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2c4f9b22c5a1fff32a3c101d6a82508aadf1b664))
* export import bar from setting ([2ad8b93](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2ad8b933ffa4b0ee9cc0c8857259035d476b3e77))
* export import bar from setting ([b81f74c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b81f74c6c389ff11994952eb5f12307797e39355))
* **husky:** enforce Gitleaks installation in pre-commit hook and improve messaging ([e5c1878](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/e5c1878905675f48187459d690dab852a7459840))
* **husky:** update gitleaks command syntax in pre-commit hook ([a94c40d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a94c40dfbe9429e183540c8ac5f5ed5a6ef0c80f))
* notification when budget is excided ([2963503](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2963503436a3caf7688e03eb92c11c6326b046a5))
* **overview:** fix e2e tests ([ef20c37](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ef20c37d0d1dbf966ddfbaf3b3203da6d7286a07))
* **overview:** minor fix ([06f78b4](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/06f78b48efea068ce6e06e788da954c505c1f2c8))
* **overview:** minor fix ([799eb64](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/799eb641cffffc79d22fd5b4e50aef771d95f450))
* **overview:** minor fix ([881565b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/881565bd25974bb7a69a4a69753e11535a759ac6))
* **overview:** use hybrid currency display strategy for small screens ([4800b3f](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4800b3f09660135d126ce69843e827dbc14f68da))
* put back the color and change the saving goal default category name behaviour ([0276200](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/0276200c85e34ef2ada128ee7c784bccc264f243))
* remove broken webp image that doesnt exist ([c70b7e6](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c70b7e61b8a4670219f074723bdc1bf23d77bc89))
* **sast:** correct nosemgrep rule IDs to match GitLab managed analyzer ([b8716fe](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b8716fee624525e9eea7e9835f8e5a9ceee44e8c))
* **sast:** exclude .pnpm-store and node_modules from SAST scan paths ([81f0285](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/81f028524b068edca4c1edfefc59f208c3cac024))
* **sast:** suppress false positive in verify-safe-areas.cjs ([8322273](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8322273edc80a5dfd5688821bd012cfc8b9b7e2c))
* saving goal name ([c633173](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/c633173d3c7c6f4c8d863fe0245558d4b9718f7a))
* saving goal name ([b92ca6a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b92ca6afbdd4d6b54ab0d3d71861b72c7e593962))
* **security:** address SAST findings from initial pipeline scan ([8be207c](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/8be207c2a73c425de473301500b48f5d1568a719))
* **test:** resolve integration test anti-patterns and strengthen assertions ([000c27d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/000c27dadee3f042a317c9ce6b4d59daf3daef13))
* **uuid:** guard crypto.getRandomValues fallback against undefined crypto ([b8ab192](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b8ab1920af230165ae49553b55b1b6beb2483876))


### Features

* **app:** add BudgetContext integration tests ([cfa172e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/cfa172ea2a33b16e3fbd728e6271584c1ffdd639))
* improve sidebar menu with "About Us", "Imprint", and "Privacy" links; add "Account Functions" and "Miscellaneous" sections ([46a5fe9](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/46a5fe9e52627054dfc969eed7c02faab747d3ef))
* **test:** minor fix ([d8a0c6d](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/d8a0c6d3fbee096d0a8b2ba20561727782346fc3))
* **test:** minor fix ([92968f8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/92968f8bc3cc6e4647839e1e537d9707ad3665ba))
* **test:** revert changes ([4111c0e](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4111c0ebf3c857f8f545313b1b881e975766fa47))
* **test:** setup integration tests ([83f70cd](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/83f70cd0dd5c67b2d75487336c26eed841765259))

# [3.4.0](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v1.1.42-test...v3.4.0) (2026-03-05)


### Bug Fixes

* BudgetContext test ([39d13e8](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/39d13e8287ff406d8b7e298f148396d4668fdb0d))
* **ci:** move chromeFlags to correct lighthouse config location ([6a240e6](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6a240e612fc9af418c0ef08d050210743e51f117))
* **ci:** resolve e2e and lighthouse pipeline failures ([a1339bc](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/a1339bc5208a954d6b491662d6d0f8d66b30314f))
* **ci:** resolve lighthouse chrome sandbox issues ([4daf264](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/4daf264f4029dec6548e5aad88965b2c7739e599))
* corrected issues with the header on the side bar ([f3ddec0](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/f3ddec099461255f38e6718be1693b097afa3ee1))
* ehanced e2e test ([ae2aca5](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ae2aca55adccda727911a00f2fe22138f1bfbdda))
* ehanced e2e test ([87890db](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/87890db97703ad818028e0e4e2c0cdfd2e5a36e4))
* ehanced e2e test ([b99b053](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/b99b053b4d77d87e83e0cabff661495a7499cf88))
* specify chromium installation in postinstall script for Playwright ([ab927e2](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/ab927e22fd79e6243f121c40e583d5404f8c51ab))


### Features

* Add E2E tests for recurring transactions, templates, and categories. ([636b8cf](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/636b8cfcc1ff84ee0453dd9ee368456fa59662f2))
* **ci:** add Google Chrome apt repository for Lighthouse CI ([6568018](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/65680186880997fac8bc73189018cb5d63750649))
* **ci:** Add server ready pattern and timeout to Lighthouse CI configuration and refine GitLab CI for LHCI execution. ([47e768b](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/47e768bc9a08f7c2c04b4c0cbb12e4de428670f7))
* **ci:** Update Lighthouse CI configuration to refine server ready pattern and enhance Chrome flag handling in GitLab CI. ([25ed971](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/25ed9719419c83b7996138420a4786465adc8ec0))
* **e2e:** Implement comprehensive E2E tests for core user flows ([fb0ffab](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/fb0ffab59a57940f743385af009085a9bcdb1a15))
* Eagerly load budget data during app initialization and refine toast component interaction with pointer events. ([2901eed](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/2901eedcf1fe6e93e22fcf1c3122c7de296f6e5d))
* Enhance E2E tests with retry logic and improve setup for recurring transactions and templates ([58c6473](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/58c647399145fbf50a6d85d3025ba57cfb255dc0))
* Implement Playwright E2E tests and Lighthouse CI with GitLab CI integration. ([6c9c57a](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/6c9c57a944ebfc51d5c31b8f9c38cda0c91af054))
* Update Lighthouse CI configuration by adjusting the server ready pattern, adding a Chrome flag, lowering the performance score threshold, and disabling PWA assertions. ([5eaa5fe](https://git.adorsys.de/dip/budget-wise-pwa-now/commits/5eaa5fef87372007fc8a90e59bdf9ee1a9faa408))

## [3.3.2](https://git.adorsys.de/dip/budget-wise-pwa-now/compare/v3.3.1-test.20260223105545...v3.3.2) (2026-02-23)
