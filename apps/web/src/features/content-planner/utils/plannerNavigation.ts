export type PlannerMonth = {
  year: number;
  monthIndex: number;
};

export function formatPlannerMonth(month: PlannerMonth): string {
  return [
    String(month.year).padStart(4, "0"),
    String(month.monthIndex + 1).padStart(2, "0"),
  ].join("-");
}

export function parsePlannerMonth(value: string | null): PlannerMonth | null {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return null;
  }

  const [year, month] = value.split("-").map(Number);

  if (year < 1000 || year > 9999) {
    return null;
  }

  return {
    year,
    monthIndex: month - 1,
  };
}

export function buildPlannerCreatePostUrl(
  month: PlannerMonth,
  dateKey?: string,
): string {
  const params = new URLSearchParams({
    from: "planner",
    month: formatPlannerMonth(month),
  });

  if (dateKey) {
    params.set("date", dateKey);
  }

  return `/posts/new?${params.toString()}`;
}

/**
 * A return destination is recognized only when
 * both the source and viewed month are valid.
 */
export function getPlannerReturnUrl(search: string): string | null {
  const params = new URLSearchParams(search);

  if (params.get("from") !== "planner") {
    return null;
  }

  const month = parsePlannerMonth(params.get("month"));

  if (!month) {
    return null;
  }

  const returnParams = new URLSearchParams({
    month: formatPlannerMonth(month),
  });

  return `/calendar?${returnParams.toString()}`;
}
