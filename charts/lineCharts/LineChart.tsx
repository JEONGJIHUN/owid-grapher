import * as React from "react"
import {
    map,
    flatten,
    some,
    includes,
    sortBy,
    filter,
    sum,
    guid,
    getRelativeMouse,
    makeSafeForCSS,
    pointsToPath,
    minBy
} from "charts/utils/Util"
import { computed, action, observable } from "mobx"
import { observer } from "mobx-react"
import { select } from "d3-selection"
import { easeLinear } from "d3-ease"

import { Bounds } from "charts/utils/Bounds"
import { AxisBox, AxisBoxView } from "charts/axis/AxisBox"
import { AxisView } from "charts/axis/AxisScale"
import { Vector2 } from "charts/utils/Vector2"
import { LineLabelsHelper, LineLabelsComponent } from "./LineLabels"
import {
    ComparisonLine,
    ComparisonLineConfig
} from "charts/scatterCharts/ComparisonLine"
import { Tooltip, TooltipProps } from "charts/core/Tooltip"
import { NoDataOverlay } from "charts/core/NoDataOverlay"
import { extent } from "d3-array"
import { EntityDimensionKey } from "charts/core/ChartConstants"
import { LineChartTransform } from "./LineChartTransform"

export interface LineChartValue {
    x: number
    y: number
    time: number
}

export interface LineChartSeries {
    entityDimensionKey: EntityDimensionKey
    entityName: string
    color: string
    values: LineChartValue[]
    classed?: string
    isProjection?: boolean
    formatValue: (value: number) => string
}

const BLUR_COLOR = "#eee"

interface LinesProps {
    axisBox: AxisBox
    xAxisView: AxisView
    yAxisView: AxisView
    data: LineChartSeries[]
    focusKeys: EntityDimensionKey[]
    onHover: (hoverX: number | undefined) => void
}

interface LineRenderSeries {
    entityDimensionKey: EntityDimensionKey
    displayKey: string
    color: string
    values: Vector2[]
    isFocus: boolean
    isProjection?: boolean
}

interface HoverTarget {
    pos: Vector2
    series: LineChartSeries
    value: LineChartValue
}

@observer
class Lines extends React.Component<LinesProps> {
    base: React.RefObject<SVGGElement> = React.createRef()
    @observable.ref hover: HoverTarget | null = null

    @computed get renderUid(): number {
        return guid()
    }

    @computed get renderData(): LineRenderSeries[] {
        const {
            data,
            xAxisView: xScale,
            yAxisView: yScale,
            focusKeys
        } = this.props
        return map(data, series => {
            return {
                entityDimensionKey: series.entityDimensionKey,
                displayKey: `key-${makeSafeForCSS(series.entityDimensionKey)}`,
                color: series.color,
                values: series.values.map(v => {
                    return new Vector2(
                        Math.round(xScale.place(v.x)),
                        Math.round(yScale.place(v.y))
                    )
                }),
                isFocus:
                    !focusKeys.length ||
                    includes(focusKeys, series.entityDimensionKey),
                isProjection: series.isProjection
            }
        })
    }

    @computed get isFocusMode(): boolean {
        return some(this.renderData, d => d.isFocus)
    }

    @computed get allValues(): LineChartValue[] {
        const values = []
        for (const series of this.props.data) {
            values.push(...series.values)
        }
        return values
    }

    @computed get hoverData(): HoverTarget[] {
        const { data } = this.props
        return flatten(
            this.renderData.map((series, i) => {
                return series.values.map((v, j) => {
                    return {
                        pos: v,
                        series: data[i],
                        value: data[i].values[j]
                    }
                })
            })
        )
    }

    @action.bound onCursorMove(ev: MouseEvent | TouchEvent) {
        const { axisBox, xAxisView: xScale } = this.props

        const mouse = getRelativeMouse(this.base.current, ev)

        let hoverX
        if (axisBox.innerBounds.contains(mouse)) {
            const closestValue = minBy(this.allValues, d =>
                Math.abs(xScale.place(d.x) - mouse.x)
            )
            hoverX = closestValue?.x
        }

        this.props.onHover(hoverX)
    }

    @action.bound onCursorLeave(ev: MouseEvent | TouchEvent) {
        this.props.onHover(undefined)
    }

    @computed get bounds() {
        const { xAxisView: xScale, yAxisView: yScale } = this.props
        return Bounds.fromCorners(
            new Vector2(xScale.range[0], yScale.range[0]),
            new Vector2(xScale.range[1], yScale.range[1])
        )
    }

    @computed get focusGroups() {
        return filter(this.renderData, g => g.isFocus)
    }

    @computed get backgroundGroups() {
        return filter(this.renderData, g => !g.isFocus)
    }

    // Don't display point markers if there are very many of them for performance reasons
    // Note that we're using circle elements instead of marker-mid because marker performance in Safari 10 is very poor for some reason
    @computed get hasMarkers(): boolean {
        return sum(this.renderData.map(g => g.values.length)) < 500
    }

    renderFocusGroups() {
        return this.focusGroups.map(series => (
            <g key={series.displayKey} className={series.displayKey}>
                <path
                    stroke={series.color}
                    strokeLinecap="round"
                    d={pointsToPath(
                        series.values.map(v => [v.x, v.y]) as [number, number][]
                    )}
                    fill="none"
                    strokeWidth={1.5}
                    strokeDasharray={series.isProjection ? "1,4" : undefined}
                />
                {this.hasMarkers && !series.isProjection && (
                    <g fill={series.color}>
                        {series.values.map((v, i) => (
                            <circle key={i} cx={v.x} cy={v.y} r={2} />
                        ))}
                    </g>
                )}
            </g>
        ))
    }

    renderBackgroundGroups() {
        return this.backgroundGroups.map(series => (
            <g key={series.displayKey} className={series.displayKey}>
                <path
                    key={series.entityDimensionKey + "-line"}
                    strokeLinecap="round"
                    stroke="#ddd"
                    d={pointsToPath(
                        series.values.map(v => [v.x, v.y]) as [number, number][]
                    )}
                    fill="none"
                    strokeWidth={1}
                />
            </g>
        ))
    }

    private container?: SVGElement
    componentDidMount() {
        const base = this.base.current as SVGGElement
        const container = base.closest("svg") as SVGElement
        container.addEventListener("mousemove", this.onCursorMove)
        container.addEventListener("mouseleave", this.onCursorLeave)
        container.addEventListener("touchstart", this.onCursorMove)
        container.addEventListener("touchmove", this.onCursorMove)
        container.addEventListener("touchend", this.onCursorLeave)
        container.addEventListener("touchcancel", this.onCursorLeave)
        this.container = container
    }

    componentWillUnmount() {
        const { container } = this
        if (container) {
            container.removeEventListener("mousemove", this.onCursorMove)
            container.removeEventListener("mouseleave", this.onCursorLeave)
            container.removeEventListener("touchstart", this.onCursorMove)
            container.removeEventListener("touchmove", this.onCursorMove)
            container.removeEventListener("touchend", this.onCursorLeave)
            container.removeEventListener("touchcancel", this.onCursorLeave)
        }
    }

    render() {
        const { hover, bounds } = this

        return (
            <g ref={this.base} className="Lines">
                <rect
                    x={Math.round(bounds.x)}
                    y={Math.round(bounds.y)}
                    width={Math.round(bounds.width)}
                    height={Math.round(bounds.height)}
                    fill="rgba(255,255,255,0)"
                    opacity={0}
                />
                {this.renderBackgroundGroups()}
                {this.renderFocusGroups()}
                {hover && (
                    <circle
                        cx={hover.pos.x}
                        cy={hover.pos.y}
                        r={5}
                        fill={hover.series.color}
                    />
                )}
            </g>
        )
    }
}

interface LineChartOptions {
    lineChartTransform: LineChartTransform
    hideLegend: true | undefined
    baseFontSize: number
    showAddEntityControls: boolean
    comparisonLines: ComparisonLineConfig[]
    formatYearFunction?: (year: number) => string // todo: remove
    isSelectingData: boolean
    canAddData: boolean
    entityType: string
    areMarksClickable: boolean
    tooltip?: TooltipProps
}

@observer
export class LineChart extends React.Component<{
    bounds: Bounds
    options: LineChartOptions
}> {
    base: React.RefObject<SVGGElement> = React.createRef()

    // Set default props
    static defaultProps = {
        bounds: new Bounds(0, 0, 640, 480)
    }

    @observable hoverX?: number
    @action.bound onHover(hoverX: number | undefined) {
        this.hoverX = hoverX
    }

    @computed private get options() {
        return this.props.options
    }

    @computed get bounds() {
        return this.props.bounds
    }

    @computed get transform() {
        return this.options.lineChartTransform
    }

    @computed get legend(): LineLabelsHelper | undefined {
        const that = this
        return new LineLabelsHelper({
            get maxWidth() {
                return that.bounds.width / 3
            },
            get fontSize() {
                return that.options.baseFontSize
            },
            get items() {
                return that.transform.legendItems
            }
        })
    }

    seriesIsBlur(series: LineChartSeries) {
        return (
            this.isFocusMode &&
            !this.focusKeys.includes(series.entityDimensionKey)
        )
    }

    @computed private get tooltip(): JSX.Element | undefined {
        const { transform, hoverX, axisBox } = this

        if (hoverX === undefined) return undefined

        const sortedData = sortBy(transform.groupedData, series => {
            const value = series.values.find(v => v.x === hoverX)
            return value !== undefined ? -value.y : Infinity
        })

        // todo: remove.
        const formatYearFunction =
            this.options.formatYearFunction || ((val: any) => val)

        return (
            <Tooltip
                tooltipOwner={this.options}
                x={axisBox.xAxisViewWithRange.place(hoverX)}
                y={
                    axisBox.yAxisViewWithRange.rangeMin +
                    axisBox.yAxisViewWithRange.rangeSize / 2
                }
                style={{ padding: "0.3em" }}
                offsetX={5}
            >
                <table
                    style={{
                        fontSize: "0.9em",
                        lineHeight: "1.4em",
                        whiteSpace: "normal"
                    }}
                >
                    <tbody>
                        <tr>
                            <td colSpan={3}>
                                <strong>{formatYearFunction(hoverX)}</strong>
                            </td>
                        </tr>
                        {sortedData.map(series => {
                            const value = series.values.find(
                                v => v.x === hoverX
                            )

                            const annotation = this.transform.getAnnotationsForSeries(
                                series.entityName
                            )

                            // It sometimes happens that data is missing for some years for a particular
                            // entity. If the user hovers over these years, we want to show a "No data"
                            // notice. However, we only want to show this notice when we are in the middle
                            // of a time series – when data points exist before and after the current year.
                            // Otherwise we want to entirely exclude the entity from the tooltip.
                            if (!value) {
                                const [startX, endX] = extent(
                                    series.values,
                                    v => v.x
                                )
                                if (
                                    startX === undefined ||
                                    endX === undefined ||
                                    startX > hoverX ||
                                    endX < hoverX
                                ) {
                                    return undefined
                                }
                            }

                            const isBlur =
                                this.seriesIsBlur(series) || value === undefined
                            const textColor = isBlur ? "#ddd" : "#333"
                            const annotationColor = isBlur ? "#ddd" : "#999"
                            const circleColor = isBlur
                                ? BLUR_COLOR
                                : series.color
                            return (
                                <tr
                                    key={series.entityDimensionKey}
                                    style={{ color: textColor }}
                                >
                                    <td>
                                        <div
                                            style={{
                                                width: "10px",
                                                height: "10px",
                                                borderRadius: "5px",
                                                backgroundColor: circleColor,
                                                display: "inline-block",
                                                marginRight: "2px"
                                            }}
                                        />
                                    </td>
                                    <td
                                        style={{
                                            paddingRight: "0.8em",
                                            fontSize: "0.9em"
                                        }}
                                    >
                                        {this.transform.getLabelForKey(
                                            series.entityDimensionKey
                                        )}
                                        {annotation && (
                                            <span
                                                className="tooltipAnnotation"
                                                style={{
                                                    color: annotationColor,
                                                    fontSize: "90%"
                                                }}
                                            >
                                                {" "}
                                                {annotation}
                                            </span>
                                        )}
                                    </td>
                                    <td
                                        style={{
                                            textAlign: "right",
                                            whiteSpace: "nowrap"
                                        }}
                                    >
                                        {!value
                                            ? "No data"
                                            : transform.yAxisView.tickFormat(
                                                  value.y,
                                                  { noTrailingZeroes: false }
                                              )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </Tooltip>
        )
    }

    // todo: Refactor
    @computed private get axisBox() {
        const { xAxisView, yAxisView } = this.transform
        return new AxisBox({
            bounds: this.bounds.padRight(this.legend ? this.legend.width : 20),
            yAxisView,
            xAxisView
        })
    }

    @observable hoverKey?: string
    @action.bound onLegendClick(key: EntityDimensionKey) {
        if (this.options.showAddEntityControls) {
            this.options.isSelectingData = true
        }
    }

    @action.bound onLegendMouseOver(key: EntityDimensionKey) {
        this.hoverKey = key
    }

    @action.bound onLegendMouseLeave() {
        this.hoverKey = undefined
    }

    @computed get focusKeys(): string[] {
        return this.hoverKey ? [this.hoverKey] : []
    }

    @computed get isFocusMode(): boolean {
        return this.focusKeys.length > 0
    }

    animSelection?: d3.Selection<
        d3.BaseType,
        unknown,
        SVGGElement | null,
        unknown
    >
    componentDidMount() {
        // Fancy intro animation

        const base = select(this.base.current)
        this.animSelection = base.selectAll("clipPath > rect").attr("width", 0)

        this.animSelection
            .transition()
            .duration(800)
            .ease(easeLinear)
            .attr("width", this.bounds.width)
            .on("end", () => this.forceUpdate()) // Important in case bounds changes during transition
    }

    componentWillUnmount() {
        if (this.animSelection) this.animSelection.interrupt()
    }

    @computed get renderUid(): number {
        return guid()
    }

    render() {
        if (this.transform.failMessage)
            return (
                <NoDataOverlay
                    bounds={this.props.bounds}
                    message={this.transform.failMessage}
                />
            )

        const {
            options,
            transform,
            bounds,
            legend,
            tooltip,
            axisBox,
            renderUid,
            hoverX
        } = this
        const {
            xAxisViewWithRange: xScale,
            yAxisViewWithRange: yScale
        } = axisBox
        const { groupedData } = transform

        const comparisonLines = options.comparisonLines || []

        return (
            <g ref={this.base} className="LineChart">
                <defs>
                    <clipPath id={`boundsClip-${renderUid}`}>
                        {/* The tiny bit of extra space here is to ensure circles centered on the very edge are still fully visible */}
                        <rect
                            x={axisBox.innerBounds.x - 10}
                            y={0}
                            width={bounds.width + 10}
                            height={bounds.height * 2}
                        ></rect>
                    </clipPath>
                </defs>
                <AxisBoxView
                    isInteractive={this.transform.chart.isInteractive}
                    axisBox={axisBox}
                    showTickMarks={true}
                />
                <g clipPath={`url(#boundsClip-${renderUid})`}>
                    {comparisonLines.map((line, i) => (
                        <ComparisonLine
                            key={i}
                            axisBox={axisBox}
                            comparisonLine={line}
                        />
                    ))}
                    {legend && (
                        <LineLabelsComponent
                            x={bounds.right - legend.width}
                            legend={legend}
                            focusKeys={this.focusKeys}
                            yAxisView={axisBox.yAxisViewWithRange}
                            onClick={this.onLegendClick}
                            options={options}
                            onMouseOver={this.onLegendMouseOver}
                            onMouseLeave={this.onLegendMouseLeave}
                        />
                    )}
                    <Lines
                        axisBox={axisBox}
                        xAxisView={axisBox.xAxisViewWithRange}
                        yAxisView={axisBox.yAxisViewWithRange}
                        data={groupedData}
                        onHover={this.onHover}
                        focusKeys={this.focusKeys}
                    />
                </g>
                {hoverX !== undefined && (
                    <g className="hoverIndicator">
                        {transform.groupedData.map(series => {
                            const value = series.values.find(
                                v => v.x === hoverX
                            )
                            if (!value || this.seriesIsBlur(series)) return null
                            else
                                return (
                                    <circle
                                        key={series.entityDimensionKey}
                                        cx={xScale.place(value.x)}
                                        cy={yScale.place(value.y)}
                                        r={4}
                                        fill={series.color}
                                    />
                                )
                        })}
                        <line
                            x1={xScale.place(hoverX)}
                            y1={yScale.range[0]}
                            x2={xScale.place(hoverX)}
                            y2={yScale.range[1]}
                            stroke="rgba(180,180,180,.4)"
                        />
                    </g>
                )}

                {tooltip}
            </g>
        )
    }
}
