import "__support__/mocks"; // included explicitly whereas with e2e tests it comes with __support__/e2e_tests

import { formatValue } from "metabase/lib/formatting";

import d3 from "d3";

import {
  NumberColumn,
  DateTimeColumn,
  StringColumn,
  dispatchUIEvent,
  renderLineAreaBar,
  getFormattedTooltips,
} from "../__support__/visualizations";

import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import lineAreaBarRenderer, {
  getDimensionsAndGroupsAndUpdateSeriesDisplayNames,
} from "metabase/visualizations/lib/LineAreaBarRenderer";

const formatTz = offset =>
  (offset < 0 ? "-" : "+") + d3.format("02d")(Math.abs(offset)) + ":00";

const BROWSER_TZ = formatTz(-new Date().getTimezoneOffset() / 60);
const ALL_TZS = d3.range(-1, 2).map(formatTz);

describe("LineAreaBarRenderer", () => {
  let element;

  beforeEach(function() {
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<div id="fixture-parent" style="height: 800px; width: 1200px;"><div id="fixture" /></div>',
    );
    element = document.getElementById("fixture");
  });

  afterEach(function() {
    document.body.removeChild(document.getElementById("fixture-parent"));
  });

  it("should display numeric year in X-axis and tooltip correctly", () => {
    const onHoverChange = jest.fn();
    renderTimeseriesLine({
      rowsOfSeries: [[[2015, 1], [2016, 2], [2017, 3]]],
      unit: "year",
      onHoverChange,
    });
    dispatchUIEvent(qs(".dot"), "mousemove");
    expect(onHoverChange.mock.calls.length).toBe(1);
    expect(getFormattedTooltips(onHoverChange.mock.calls[0][0])).toEqual([
      "2015",
      "1",
    ]);
    // Doesn't return the correct ticks in Jest for some reason
    // expect(qsa(".tick text").map(e => e.textContent)).toEqual([
    //     "2015",
    //     "2016",
    //     "2017"
    // ]);
  });

  it("should display a warning for invalid dates", () => {
    const onRender = jest.fn();
    renderTimeseriesLine({
      rowsOfSeries: [[["2019-W52", 1], ["2019-W53", 2], ["2019-W01", 3]]],
      unit: "week",
      onRender,
    });
    const [[{ warnings }]] = onRender.mock.calls;
    expect(warnings).toEqual(['We encountered an invalid date: "2019-W53"']);
  });

  ["Z", ...ALL_TZS].forEach(tz =>
    it(
      "should display hourly data (in " +
        tz +
        " timezone) in X axis and tooltip consistently",
      () => {
        const onHoverChange = jest.fn();

        const rows = [
          ["2016-10-03T20:00:00.000" + tz, 1],
          ["2016-10-03T21:00:00.000" + tz, 1],
        ];

        renderTimeseriesLine({
          rowsOfSeries: [rows],
          unit: "hour",
          onHoverChange,
        });

        dispatchUIEvent(qs(".dot"), "mousemove");

        const expected = rows.map(row =>
          formatValue(row[0], {
            column: DateTimeColumn({ unit: "hour" }),
          }),
        );
        expect(getFormattedTooltips(onHoverChange.mock.calls[0][0])).toEqual([
          expected[0],
          "1",
        ]);
        expect(qsa(".axis.x .tick text").map(e => e.textContent)).toEqual(
          expected,
        );
      },
    ),
  );

  it("should display hourly data (in the browser's timezone) in X axis and tooltip consistently and correctly", () => {
    const onHoverChange = jest.fn();
    const tz = BROWSER_TZ;
    const rows = [
      ["2016-01-01T01:00:00.000" + tz, 1],
      ["2016-01-01T02:00:00.000" + tz, 1],
      ["2016-01-01T03:00:00.000" + tz, 1],
      ["2016-01-01T04:00:00.000" + tz, 1],
    ];

    renderTimeseriesLine({
      rowsOfSeries: [rows],
      unit: "hour",
      onHoverChange,
    });

    dispatchUIEvent(qs(".dot"), "mousemove");

    expect(
      formatValue(rows[0][0], {
        column: DateTimeColumn({ unit: "hour" }),
      }),
    ).toEqual("January 1, 2016, 1:00 AM");

    expect(getFormattedTooltips(onHoverChange.mock.calls[0][0])).toEqual([
      "January 1, 2016, 1:00 AM",
      "1",
    ]);

    expect(qsa(".axis.x .tick text").map(e => e.textContent)).toEqual([
      "January 1, 2016, 1:00 AM",
      "January 1, 2016, 2:00 AM",
      "January 1, 2016, 3:00 AM",
      "January 1, 2016, 4:00 AM",
    ]);
  });

  it("should display weekly ranges in tooltips and months on x axis", () => {
    const rows = [
      ["2020-01-05T00:00:00.000Z", 1],
      ["2020-01-12T00:00:00.000Z", 1],
      ["2020-01-19T00:00:00.000Z", 1],
      ["2020-02-02T00:00:00.000Z", 1],
      ["2020-02-09T00:00:00.000Z", 1],
      ["2020-02-16T00:00:00.000Z", 1],
      ["2020-02-23T00:00:00.000Z", 1],
      ["2020-03-01T00:00:00.000Z", 1],
    ];

    // column settings are cached based on name.
    // we need something unique to not conflict with other tests.
    const dateColumn = DateTimeColumn({
      unit: "week",
      name: Math.random().toString(36),
    });

    const cols = [dateColumn, NumberColumn()];
    const chartType = "line";
    const series = [{ data: { cols, rows }, card: { display: chartType } }];
    const settings = getComputedSettingsForSeries(series);
    const onHoverChange = jest.fn();

    const props = { chartType, series, settings, onHoverChange };
    lineAreaBarRenderer(element, props);

    dispatchUIEvent(qs(".dot"), "mousemove");

    const hover = onHoverChange.mock.calls[0][0];
    const [formattedWeek] = getFormattedTooltips(hover, settings);
    expect(formattedWeek).toEqual("January 5 – 11, 2020");

    const ticks = qsa(".axis.x .tick text").map(e => e.textContent);
    expect(ticks).toEqual(["January, 2020", "February, 2020", "March, 2020"]);
  });

  it("should use column settings for tick formatting and tooltips", () => {
    const rows = [["2016-01-01", 1], ["2016-02-01", 2]];

    // column settings are cached based on name.
    // we need something unique to not conflict with other tests.
    const columnName = Math.random().toString(36);
    const dateColumn = DateTimeColumn({ unit: "month", name: columnName });

    const cols = [dateColumn, NumberColumn()];
    const chartType = "line";
    const column_settings = {
      [`["name","${columnName}"]`]: {
        date_style: "M/D/YYYY",
        date_separator: "-",
      },
    };
    const card = {
      display: chartType,
      visualization_settings: { column_settings },
    };
    const series = [{ data: { cols, rows }, card }];
    const settings = getComputedSettingsForSeries(series);
    const onHoverChange = jest.fn();

    const props = { chartType, series, settings, onHoverChange };
    lineAreaBarRenderer(element, props);

    dispatchUIEvent(qs(".dot"), "mousemove");

    const hover = onHoverChange.mock.calls[0][0];
    const [formattedWeek] = getFormattedTooltips(hover, settings);
    expect(formattedWeek).toEqual("1-2016");

    const ticks = qsa(".axis.x .tick text").map(e => e.textContent);
    expect(ticks).toEqual(["1-2016", "2-2016"]);
  });

  describe("should render correctly a compound line graph", () => {
    const rowsOfNonemptyCard = [[2015, 1], [2016, 2], [2017, 3]];

    it("when only second series is not empty", () => {
      renderTimeseriesLine({
        rowsOfSeries: [[], rowsOfNonemptyCard, [], []],
        unit: "hour",
      });

      // A simple check to ensure that lines are rendered as expected
      expect(qs(".line")).not.toBe(null);
    });

    it("when only first series is not empty", () => {
      renderTimeseriesLine({
        rowsOfSeries: [rowsOfNonemptyCard, [], [], []],
        unit: "hour",
      });

      expect(qs(".line")).not.toBe(null);
    });

    it("when there are many empty and nonempty values ", () => {
      renderTimeseriesLine({
        rowsOfSeries: [
          [],
          rowsOfNonemptyCard,
          [],
          [],
          rowsOfNonemptyCard,
          [],
          rowsOfNonemptyCard,
        ],
        unit: "hour",
      });
      expect(qs(".line")).not.toBe(null);
    });
  });

  describe("should render correctly a compound bar graph", () => {
    it("when only second series is not empty", () => {
      renderScalarBar({
        scalars: [["Non-empty value", null], ["Empty value", 25]],
      });
      expect(qs(".bar")).not.toBe(null);
    });

    it("when only first series is not empty", () => {
      renderScalarBar({
        scalars: [["Non-empty value", 15], ["Empty value", null]],
      });
      expect(qs(".bar")).not.toBe(null);
    });

    it("when there are many empty and nonempty scalars", () => {
      renderScalarBar({
        scalars: [
          ["Empty value", null],
          ["Non-empty value", 15],
          ["2nd empty value", null],
          ["2nd non-empty value", 35],
          ["3rd empty value", null],
          ["4rd empty value", null],
          ["3rd non-empty value", 0],
        ],
      });
      expect(qs(".bar")).not.toBe(null);
    });
  });

  describe("goals", () => {
    it("should render a goal line", () => {
      const rows = [["2016", 1], ["2017", 2]];

      renderTimeseriesLine({
        rowsOfSeries: [rows],
        settings: {
          "graph.show_goal": true,
          "graph.goal_value": 30,
          "graph.goal_label": "Goal",
        },
      });

      expect(qs(".goal .line")).not.toBe(null);
      expect(qs(".goal text")).not.toBe(null);
      expect(qs(".goal text").textContent).toEqual("Goal");
    });

    it("should render a goal tooltip with the proper value", () => {
      const rows = [["2016", 1], ["2017", 2]];

      const goalValue = 30;
      const onHoverChange = jest.fn();
      renderTimeseriesLine({
        rowsOfSeries: [rows],
        settings: {
          "graph.show_goal": true,
          "graph.goal_value": goalValue,
          "graph.goal_label": "Goal",
        },
        onHoverChange,
      });
      dispatchUIEvent(qs(".goal text"), "mouseenter");

      expect(getFormattedTooltips(onHoverChange.mock.calls[0][0])).toEqual([
        "30",
      ]);
    });
  });

  describe("histogram", () => {
    it("should have one more tick than it has bars", () => {
      // this is because each bar has a tick on either side
      renderLineAreaBar(
        element,
        [
          {
            data: {
              cols: [NumberColumn(), NumberColumn()],
              rows: [[1, 1], [2, 2], [3, 1]],
            },
            card: {
              display: "bar",
              visualization_settings: {
                "graph.x_axis.axis_enabled": true,
                "graph.x_axis.scale": "histogram",
              },
            },
          },
        ],
        {},
      );
      expect(qsa(".axis.x .tick").length).toBe(4);
    });
  });

  describe("getDimensionsAndGroupsAndUpdateSeriesDisplayNames", () => {
    it("should group a single row", () => {
      const props = { settings: {}, chartType: "bar" };
      const data = [[["a", 1]]];
      const warn = jest.fn();

      const {
        groups,
        dimension,
        yExtents,
      } = getDimensionsAndGroupsAndUpdateSeriesDisplayNames(props, data, warn);

      expect(warn).not.toBeCalled();
      expect(groups[0][0].all()[0]).toEqual({ key: "a", value: 1 });
      expect(dimension.top(1)).toEqual([["a", 1]]);
      expect(yExtents).toEqual([[1, 1]]);
    });

    it("should group multiple series", () => {
      const props = { settings: {}, chartType: "bar" };
      const data = [[["a", 1], ["b", 2]], [["a", 2], ["b", 3]]];
      const warn = jest.fn();

      const {
        groups,
        yExtents,
      } = getDimensionsAndGroupsAndUpdateSeriesDisplayNames(props, data, warn);

      expect(warn).not.toBeCalled();
      expect(groups.length).toEqual(2);
      expect(yExtents).toEqual([[1, 2], [2, 3]]);
    });

    it("should group stacked series", () => {
      const props = {
        settings: { "stackable.stack_type": "stacked" },
        chartType: "bar",
      };
      const data = [[["a", 1], ["b", 2]], [["a", 2], ["b", 3]]];
      const warn = jest.fn();

      const {
        groups,
        yExtents,
      } = getDimensionsAndGroupsAndUpdateSeriesDisplayNames(props, data, warn);

      expect(warn).not.toBeCalled();
      expect(groups.length).toEqual(1);
      expect(yExtents).toEqual([[3, 5]]);
    });
  });
  // querySelector shortcut
  const qs = selector => element.querySelector(selector);

  // querySelectorAll shortcut, casts to Array
  const qsa = selector => [...element.querySelectorAll(selector)];

  // helper for timeseries line charts
  const renderTimeseriesLine = ({
    rowsOfSeries,
    onHoverChange,
    onRender,
    unit,
    settings,
  }) => {
    renderLineAreaBar(
      element,
      rowsOfSeries.map(rows => ({
        data: {
          cols: [DateTimeColumn({ unit }), NumberColumn()],
          rows: rows,
        },
        card: {
          display: "line",
          visualization_settings: {
            "graph.x_axis.scale": "timeseries",
            "graph.x_axis.axis_enabled": true,
            "graph.colors": ["#000000"],
            ...settings,
          },
        },
      })),
      {
        onHoverChange,
        onRender,
      },
    );
  };

  const renderScalarBar = ({ scalars, onHoverChange, unit }) => {
    renderLineAreaBar(
      element,
      scalars.map(scalar => ({
        data: {
          cols: [StringColumn(), NumberColumn()],
          rows: [scalar],
        },
        card: {
          display: "bar",
          visualization_settings: {
            "bar.scalar_series": true,
            "funnel.type": "bar",
            "graph.colors": ["#509ee3", "#9cc177", "#a989c5", "#ef8c8c"],
            "graph.x_axis.axis_enabled": true,
            "graph.x_axis.scale": "ordinal",
          },
        },
      })),
      { onHoverChange },
    );
  };
});
