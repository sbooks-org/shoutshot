// Copyright (C) 2026 Simplebooks Foundation
// Copyright (C) 2026 Josh Rodd
// SPDX-License-Identifier: MIT-0
// Optional pre-filled settings for everyone you share this build with.
//
// API keys are NOT needed: by default Shoutshot uploads the way the websites
// themselves do. Only fill these in if you want builds you hand out to use the
// "With my API key" mode for Imgur and/or ImgBB (and set imgurMode/imgbbMode to
// 'api' as well). Any setting from shared.js's BUILTIN list can go here; values
// chosen on the Settings page win over these.
//
// NOTE: anyone who has the extension can read anything in this file. That's
// fine for family/friends, but don't publish a build with your keys in it.
self.SHOUTSHOT_DEFAULTS = {
  imgurClientId: '',
  imgbbApiKey: '',
};
