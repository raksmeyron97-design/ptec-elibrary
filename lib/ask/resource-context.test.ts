import { describe, expect, it } from "vitest";
import { resourceContext } from "@/lib/ask/resource-context";

describe("resourceContext — what the assistant scopes to", () => {
  it.each([
    ["/books/intro-to-pedagogy", { slug: "intro-to-pedagogy", slugType: "book" }],
    ["/km/books/intro-to-pedagogy/read", { slug: "intro-to-pedagogy", slugType: "book" }],
    ["/theses/first-posting", { slug: "first-posting", slugType: "research" }],
    ["/km/theses/first-posting", { slug: "first-posting", slugType: "research" }],
    // The regression this module exists for: articles moved here in #203.
    ["/journals/articles/handmade-conductivity", { slug: "handmade-conductivity", slugType: "publication" }],
    ["/km/journals/articles/handmade-conductivity", { slug: "handmade-conductivity", slugType: "publication" }],
    ["/journals/articles/%E1%9E%80%E1%9E%B6", { slug: "កា", slugType: "publication" }],
  ])("%s", (pathname, expected) => {
    expect(resourceContext(pathname)).toEqual(expected);
  });

  it.each([
    "/",
    "/books",
    "/journals",
    // A journal and its issues are collections, not records.
    "/journals/cambodian-journal-of-teacher-education",
    "/journals/cambodian-journal-of-teacher-education/issues/vol-7-issue-2",
    "/journals/articles",
    // The retired path 301s away; nobody is ever on it.
    "/publications/handmade-conductivity",
    "/books/read",
    "/journals/articles/%E0%A4%A",
  ])("does not scope %s", (pathname) => {
    expect(resourceContext(pathname)).toBeNull();
  });
});
