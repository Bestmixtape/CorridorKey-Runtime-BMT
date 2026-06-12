import { describe, expect, test } from "vitest";
import { formatJobTiming, jobStatusTitle } from "@/lib/jobStatus";

describe("job status helpers", () => {
  test("names terminal and running states for the workbench", () => {
    expect(jobStatusTitle("failed", false, 40)).toBe("Processing Failed");
    expect(jobStatusTitle("running", false, 40)).toBe("In Progress");
    expect(jobStatusTitle("completed", false, 100)).toBe("Complete");
    expect(jobStatusTitle("cancelled", false, 10)).toBe("Cancelled");
  });

  test("treats an explicit error as failed regardless of progress", () => {
    expect(jobStatusTitle("running", true, 80)).toBe("Processing Failed");
  });

  test("formats stage timings for display", () => {
    expect(formatJobTiming(12.345)).toBe("12.3ms");
    expect(formatJobTiming(undefined)).toBe("n/a");
  });
});
