#!/usr/bin/env python3
"""Descriptive summary of an Evidence Vault usability-test results sheet.

Reads a CSV with the results-template columns. Blank Total minutes and Errors
are skipped and are never treated as zero. Missing times stay missing.
"""

from __future__ import annotations

import csv
import math
import sys
from pathlib import Path

REQUIRED_COLUMNS = (
    "Participant ID",
    "Profile ID",
    "Method",
    "Form",
    "Order",
    "Start time",
    "End time",
    "Total minutes",
    "Errors",
    "Notes",
)

METHOD_APP = "App"
METHOD_EXCEL = "Excel/Drive"
COMPARED_METHODS = (METHOD_APP, METHOD_EXCEL)

NOTE = (
    "Note: n = 8. This is descriptive only (friendly testers, "
    "fictional profiles, short time frame)."
)


def default_csv() -> Path:
    return Path(__file__).resolve().parent.parent / "test-data" / "results_template.csv"


def parse_optional_number(raw: str | None) -> tuple[float | None, str | None]:
    """Return (value, problem). A blank cell is (None, None), not zero."""
    text = (raw or "").strip()
    if text == "":
        return None, None
    try:
        number = float(text)
    except ValueError:
        return None, text
    if not math.isfinite(number):
        return None, text
    return number, None


def normalize_order(order: str) -> str:
    if order in {"1", "2"}:
        return order
    try:
        number = float(order)
    except ValueError:
        return order
    if number == 1:
        return "1"
    if number == 2:
        return "2"
    return order


def participant_sort_key(participant_id: str) -> tuple[int, str]:
    digits = "".join(character for character in participant_id if character.isdigit())
    return (int(digits) if digits else 10**9, participant_id)


def mean(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def format_number(value: float | None) -> str:
    if value is None:
        return "missing"
    return f"{value:.2f}"


def load_rows(path: Path) -> tuple[list[dict[str, object]], list[str]]:
    if not path.is_file():
        raise SystemExit(f"Results CSV not found: {path}")

    warnings: list[str] = []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        fieldnames = list(reader.fieldnames or [])
        if not fieldnames:
            raise SystemExit(f"CSV has no header row: {path}")
        missing = [name for name in REQUIRED_COLUMNS if name not in fieldnames]
        if missing:
            raise SystemExit("CSV is missing columns: " + ", ".join(missing))

        rows: list[dict[str, object]] = []
        for line_number, raw in enumerate(reader, start=2):
            if all(not (value or "").strip() for value in raw.values()):
                continue
            minutes, minutes_problem = parse_optional_number(raw.get("Total minutes"))
            errors, errors_problem = parse_optional_number(raw.get("Errors"))
            participant = (raw.get("Participant ID") or "").strip()
            label = participant or "unknown participant"
            if minutes_problem is not None:
                warnings.append(
                    f"Line {line_number}: skipped non-numeric Total minutes "
                    f"({minutes_problem!r}) for {label}."
                )
            if errors_problem is not None:
                warnings.append(
                    f"Line {line_number}: skipped non-numeric Errors "
                    f"({errors_problem!r}) for {label}."
                )
            rows.append(
                {
                    "participant": participant,
                    "method": (raw.get("Method") or "").strip(),
                    "order": normalize_order((raw.get("Order") or "").strip()),
                    "minutes": minutes,
                    "errors": errors,
                }
            )
    return rows, warnings


def collected(
    rows: list[dict[str, object]],
    field: str,
    *,
    method: str | None = None,
    order: str | None = None,
    participant: str | None = None,
) -> list[float]:
    values: list[float] = []
    for row in rows:
        if method is not None and row["method"] != method:
            continue
        if order is not None and row["order"] != order:
            continue
        if participant is not None and row["participant"] != participant:
            continue
        value = row[field]
        if isinstance(value, float):
            values.append(value)
    return values


def print_table(headers: list[str], body: list[list[str]]) -> None:
    widths = [len(header) for header in headers]
    for row in body:
        for index, cell in enumerate(row):
            widths[index] = max(widths[index], len(cell))

    def render(cells: list[str]) -> str:
        return "  ".join(
            cell.ljust(widths[index]) for index, cell in enumerate(cells)
        ).rstrip()

    print(render(headers))
    print(render("-" * width for width in widths))
    for row in body:
        print(render(row))


def method_label(method: str) -> str:
    return method if method else "(blank)"


def methods_for_table(rows: list[dict[str, object]]) -> list[str]:
    present = {str(row["method"]) for row in rows}
    extras = sorted(method for method in present if method not in COMPARED_METHODS)
    return [*COMPARED_METHODS, *extras]


def percent_faster(app_average: float | None, excel_average: float | None) -> str:
    if app_average is None or excel_average is None:
        return "Times are missing, so percent faster is not calculated."
    if app_average == excel_average:
        return (
            "App and Excel/Drive have the same average minutes, "
            "so neither is faster."
        )
    if app_average < excel_average:
        faster = METHOD_APP
        faster_average = app_average
        slower = METHOD_EXCEL
        slower_average = excel_average
    else:
        faster = METHOD_EXCEL
        faster_average = excel_average
        slower = METHOD_APP
        slower_average = app_average
    if faster_average == 0 or slower_average == 0:
        return (
            f"{faster} is faster than {slower} "
            f"(average minutes {faster_average:.2f} vs {slower_average:.2f}). "
            "A percent is not calculated because an average is zero."
        )
    # "X% faster" is the extra time the slower method took, divided by the faster time.
    percent = (slower_average - faster_average) / faster_average * 100
    return (
        f"{faster} is faster than {slower} by {percent:.1f}% "
        f"(average minutes {faster_average:.2f} vs {slower_average:.2f})."
    )


def difference_cell(app_value: float | None, excel_value: float | None) -> str:
    if app_value is None or excel_value is None:
        return "missing"
    return f"{app_value - excel_value:.2f}"


def print_report(
    rows: list[dict[str, object]],
    warnings: list[str],
) -> None:
    minute_rows = sum(isinstance(row["minutes"], float) for row in rows)
    error_rows = sum(isinstance(row["errors"], float) for row in rows)

    print("Evidence Vault usability test (descriptive summary)")
    print(NOTE)
    print()
    print(
        f"Rows in sheet: {len(rows)}. "
        f"Rows with Total minutes: {minute_rows}. "
        f"Rows with Errors: {error_rows}."
    )
    for warning in warnings:
        print(warning)

    if minute_rows == 0 and error_rows == 0:
        print("No completed rows yet.")
        return

    print(
        "Blank Total minutes and Errors were skipped and were not treated as zero."
    )
    if minute_rows == 0:
        print("No completed rows yet.")
    print()

    print("Average minutes (App vs Excel/Drive)")
    minute_means: dict[str, float | None] = {}
    minute_body: list[list[str]] = []
    for method in methods_for_table(rows):
        values = collected(rows, "minutes", method=method)
        minute_means[method] = mean(values)
        minute_body.append(
            [method_label(method), str(len(values)), format_number(mean(values))]
        )
    print_table(["Method", "Rows used", "Average minutes"], minute_body)
    print()

    print("Average errors (App vs Excel/Drive)")
    error_body: list[list[str]] = []
    for method in methods_for_table(rows):
        values = collected(rows, "errors", method=method)
        error_body.append(
            [method_label(method), str(len(values)), format_number(mean(values))]
        )
    print_table(["Method", "Rows used", "Average errors"], error_body)
    print()

    print("Percent faster (App vs Excel/Drive)")
    print(
        percent_faster(
            minute_means.get(METHOD_APP),
            minute_means.get(METHOD_EXCEL),
        )
    )
    print()

    print("Per-participant difference (App minus Excel/Drive)")
    participant_ids = sorted(
        {str(row["participant"]) for row in rows if str(row["participant"])},
        key=participant_sort_key,
    )
    if any(not str(row["participant"]) for row in rows):
        participant_ids.append("")
    difference_body: list[list[str]] = []
    for participant in participant_ids:
        app_minutes = mean(
            collected(rows, "minutes", method=METHOD_APP, participant=participant)
        )
        excel_minutes = mean(
            collected(rows, "minutes", method=METHOD_EXCEL, participant=participant)
        )
        app_errors = mean(
            collected(rows, "errors", method=METHOD_APP, participant=participant)
        )
        excel_errors = mean(
            collected(rows, "errors", method=METHOD_EXCEL, participant=participant)
        )
        difference_body.append(
            [
                participant or "(blank)",
                difference_cell(app_minutes, excel_minutes),
                difference_cell(app_errors, excel_errors),
            ]
        )
    print_table(
        [
            "Participant ID",
            "Minutes (App minus Excel/Drive)",
            "Errors (App minus Excel/Drive)",
        ],
        difference_body,
    )
    print()

    print("Results split by order (first task vs second task)")
    order_specs = [("1", "first task"), ("2", "second task")]
    known = {order for order, _label in order_specs}
    extras = sorted(
        {str(row["order"]) for row in rows if str(row["order"]) not in known}
    )
    for extra in extras:
        order_specs.append((extra, "unspecified" if extra == "" else extra))
    order_body: list[list[str]] = []
    for order, label in order_specs:
        minutes = collected(rows, "minutes", order=order)
        errors = collected(rows, "errors", order=order)
        order_body.append(
            [
                order or "(blank)",
                label,
                str(len(minutes)),
                format_number(mean(minutes)),
                str(len(errors)),
                format_number(mean(errors)),
            ]
        )
    print_table(
        [
            "Order",
            "Task",
            "Rows used (minutes)",
            "Average minutes",
            "Rows used (errors)",
            "Average errors",
        ],
        order_body,
    )


def main(argv: list[str]) -> int:
    if len(argv) > 2:
        raise SystemExit(f"Usage: {Path(argv[0]).name} [results.csv]")
    path = Path(argv[1]) if len(argv) > 1 else default_csv()
    rows, warnings = load_rows(path)
    print_report(rows, warnings)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
