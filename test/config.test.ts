import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { config, validateConfig } from "../src/config.js";

describe("validateConfig", () => {
  const original = {
    baseUrl: config.jira.baseUrl,
    email: config.jira.email,
    apiToken: config.jira.apiToken,
    project: config.jira.project,
  };

  beforeEach(() => {
    config.jira.baseUrl = "https://test.atlassian.net";
    config.jira.email = "test@test.com";
    config.jira.apiToken = "token";
    config.jira.project = "TEST";
  });

  afterEach(() => {
    config.jira.baseUrl = original.baseUrl;
    config.jira.email = original.email;
    config.jira.apiToken = original.apiToken;
    config.jira.project = original.project;
  });

  it("does not throw when all required vars are set", () => {
    expect(() => validateConfig()).not.toThrow();
  });

  it("throws when JIRA_BASE_URL is missing", () => {
    config.jira.baseUrl = "";
    expect(() => validateConfig()).toThrow("JIRA_BASE_URL");
  });

  it("throws when JIRA_EMAIL is missing", () => {
    config.jira.email = "";
    expect(() => validateConfig()).toThrow("JIRA_EMAIL");
  });

  it("throws when JIRA_API_TOKEN is missing", () => {
    config.jira.apiToken = "";
    expect(() => validateConfig()).toThrow("JIRA_API_TOKEN");
  });

  it("throws when JIRA_PROJECT is missing", () => {
    config.jira.project = "";
    expect(() => validateConfig()).toThrow("JIRA_PROJECT");
  });

  it("lists all missing vars in error", () => {
    config.jira.baseUrl = "";
    config.jira.email = "";
    config.jira.apiToken = "";
    config.jira.project = "";
    expect(() => validateConfig()).toThrow(
      "JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT"
    );
  });
});
