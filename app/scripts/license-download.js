// SPDX-FileCopyrightText: 2026 Aryan Singh
// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)

function getLicenseDetailUrl(detailUrl, baseLicenseUrl) {
  const urlRegex = new RegExp("^(?:[a-z]+:)?//", "i");
  let resolvedUrl = urlRegex.test(detailUrl)
    ? detailUrl.replace(/^http:/i, "https:")
    : baseLicenseUrl + detailUrl;

  if (/\.html$/i.test(resolvedUrl)) {
    resolvedUrl = resolvedUrl.replace(/\.html$/i, ".json");
  }

  return resolvedUrl;
}

async function downloadLicenseList({
  urls,
  spdxkey,
  baseLicenseUrl,
  getJSON,
  onProgressMax = () => {},
  onProgress = () => {},
}) {
  const catalogs = {};
  let totalProgress = 0;
  let currentProgress = 0;

  for (const type of Object.keys(urls)) {
    const result = await getJSON(urls[type]);
    if (!result || !Array.isArray(result[type])) {
      throw new Error("Invalid " + type + " catalog response");
    }

    catalogs[type] = result;
    totalProgress += result[type].length;
  }

  onProgressMax(totalProgress);

  const masterList = {};
  for (const type of Object.keys(catalogs)) {
    const result = catalogs[type];
    const dict = {};
    const failed = [];

    for (const item of result[type]) {
      const licenseId = item[spdxkey[type].id];
      const detailUrl = getLicenseDetailUrl(item.detailsUrl, baseLicenseUrl);

      try {
        const licenseData = await getJSON(detailUrl);
        dict[licenseData[spdxkey[type].id]] = licenseData;
      } catch {
        failed.push(licenseId);
      }

      currentProgress++;
      onProgress(currentProgress);
    }

    masterList[type] = {
      licenses: result[type],
      dict,
      licenseListVersion: result.licenseListVersion,
      releaseDate: result.releaseDate,
      failed,
    };
  }

  return masterList;
}

function formatUpdateError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("Network Error") ||
    message.includes("Failed to fetch") ||
    message.includes("403") ||
    message.includes("ERR_BLOCKED_BY_CLIENT")
  ) {
    return "Permission or network error accessing SPDX.org. Please check that you have granted permission to access spdx.org in your browser extension settings.";
  }

  return "Failed to update license list: " + message;
}

export { downloadLicenseList, formatUpdateError, getLicenseDetailUrl };
