// TODO make this a string enum in TypeScript 2.4
import { keyBy } from "charts/utils/Util"

export type ChartTypeName =
    | "LineChart"
    | "ScatterPlot"
    | "TimeScatter"
    | "StackedArea"
    | "DiscreteBar"
    | "SlopeChart"
    | "StackedBar"

export class ChartType {
    static LineChart: ChartTypeName = "LineChart"
    static ScatterPlot: ChartTypeName = "ScatterPlot"
    static TimeScatter: ChartTypeName = "TimeScatter"
    static StackedArea: ChartTypeName = "StackedArea"
    static DiscreteBar: ChartTypeName = "DiscreteBar"
    static SlopeChart: ChartTypeName = "SlopeChart"
    static StackedBar: ChartTypeName = "StackedBar"
}

export type StackMode = "absolute" | "relative"

// todo: remove
export type EntityDimensionKey = string

export type ChartTabOption = "chart" | "map" | "sources" | "download" | "table"

export type Color = string

export enum ScaleType {
    linear = "linear",
    log = "log"
}

export interface HighlightToggleConfig {
    description: string
    paramStr: string
}

export interface RelatedQuestionsConfig {
    text: string
    url: string
}

// When a user hovers over a connected series line in a ScatterPlot we show
// a label for each point. By default that value will be from the "year" column
// but by changing this option the column used for the x or y axis could be used instead.
export declare type ScatterPointLabelStrategy = "year" | "x" | "y"

export enum SortOrder {
    asc = "asc",
    desc = "desc"
}

export interface TickFormattingOptions {
    numDecimalPlaces?: number
    unit?: string
    noTrailingZeroes?: boolean
    noSpaceUnit?: boolean
    numberPrefixes?: boolean
    shortNumberPrefixes?: boolean
    showPlus?: boolean
    isFirstOrLastTick?: boolean
}

export const ChartTypeDefs = [
    {
        key: ChartType.LineChart,
        label: "Line Chart"
    },
    {
        key: ChartType.ScatterPlot,
        label: "Scatter Plot"
    },
    {
        key: ChartType.TimeScatter,
        label: "Time Scatter"
    },
    {
        key: ChartType.StackedArea,
        label: "Stacked Area"
    },
    {
        key: ChartType.DiscreteBar,
        label: "Discrete Bar"
    },
    {
        key: ChartType.SlopeChart,
        label: "Slope Chart"
    },
    {
        key: ChartType.StackedBar,
        label: "Stacked Bar"
    }
]

export const ChartTypeDefsByKey = keyBy(ChartTypeDefs, e => e.key)
