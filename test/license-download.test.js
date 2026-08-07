// SPDX-FileCopyrightText: 2026 Aryan Singh
// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)

const {
  downloadLicenseList,
  formatUpdateError,
  getLicenseDetailUrl,
} = require("../app/scripts/license-download.js");

const urls = {
  licenses: "https://spdx.test/licenses.json",
  exceptions: "https://spdx.test/exceptions.json",
};

const spdxkey = {
  licenses: { id: "licenseId" },
  exceptions: { id: "licenseExceptionId" },
};

describe("license download test infrastructure", () => {
  test("records individual failures while returning the successful data", async () => {
    const responses = {
      [urls.licenses]: {
        licenses: [
          { licenseId: "MIT", detailsUrl: "MIT.html" },
          { licenseId: "Apache-2.0", detailsUrl: "Apache-2.0.json" },
        ],
        licenseListVersion: "3.0",
        releaseDate: "2026-01-01",
      },
      [urls.exceptions]: {
        exceptions: [
          {
            licenseExceptionId: "LLVM-exception",
            detailsUrl: "LLVM-exception.json",
          },
        ],
        licenseListVersion: "3.0",
        releaseDate: "2026-01-01",
      },
      "https://spdx.test/MIT.json": {
        licenseId: "MIT",
        name: "MIT License",
      },
      "https://spdx.test/Apache-2.0.json": new Error("404"),
      "https://spdx.test/LLVM-exception.json": {
        licenseExceptionId: "LLVM-exception",
        name: "LLVM Exception",
      },
    };
    const progress = [];
    const getJSON = jest.fn(async (url) => {
      const response = responses[url];
      if (response instanceof Error) {
        throw response;
      }
      return response;
    });

    const result = await downloadLicenseList({
      urls,
      spdxkey,
      baseLicenseUrl: "https://spdx.test/",
      getJSON,
      onProgressMax: (value) => progress.push(["max", value]),
      onProgress: (value) => progress.push(["value", value]),
    });

    expect(result.licenses.dict).toEqual({
      MIT: { licenseId: "MIT", name: "MIT License" },
    });
    expect(result.licenses.failed).toEqual(["Apache-2.0"]);
    expect(result.exceptions.failed).toEqual([]);
    expect(progress).toEqual([
      ["max", 3],
      ["value", 1],
      ["value", 2],
      ["value", 3],
    ]);
    expect(getJSON).toHaveBeenCalledTimes(5);
  });

  test("fails before publishing a partial result when a catalog cannot be loaded", async () => {
    const getJSON = jest.fn(async () => {
      throw new Error("Network Error");
    });

    await expect(
      downloadLicenseList({
        urls,
        spdxkey,
        baseLicenseUrl: "https://spdx.test/",
        getJSON,
      })
    ).rejects.toThrow("Network Error");
  });

  test("normalizes detail URLs for HTTP and HTML catalog entries", () => {
    expect(
      getLicenseDetailUrl("http://spdx.test/MIT.html", "https://spdx.test/")
    ).toBe("https://spdx.test/MIT.json");
    expect(
      getLicenseDetailUrl("Apache-2.0.html", "https://spdx.test/")
    ).toBe("https://spdx.test/Apache-2.0.json");
    expect(
      getLicenseDetailUrl(
        "https://example.test/license.json",
        "https://spdx.test/"
      )
    ).toBe("https://example.test/license.json");
  });

  test("turns network and permission failures into actionable messages", () => {
    expect(formatUpdateError(new Error("403 Forbidden"))).toMatch(
      /Permission or network error/
    );
    expect(formatUpdateError(new Error("unexpected response"))).toBe(
      "Failed to update license list: unexpected response"
    );
  });
});
