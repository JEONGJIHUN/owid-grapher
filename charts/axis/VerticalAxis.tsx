import { sortBy, maxBy } from "../utils/Util"
import * as React from "react"
import { computed } from "mobx"
import { observer } from "mobx-react"
import { Bounds } from "charts/utils/Bounds"
import { AxisScale, Tickmark } from "./AxisScale"
import { ScaleSelector } from "../controls/ScaleSelector"
import { TextWrap } from "charts/text/TextWrap"
import { ControlsOverlay } from "../controls/Controls"
import { ScaleType } from "charts/core/ChartConstants"

interface VerticalAxisProps {
    scale: AxisScale
    labelText: string
    fontSize: number
}

// Axis layout model. Computes the space needed for displaying an axis.
export class VerticalAxis {
    props: VerticalAxisProps
    constructor(props: VerticalAxisProps) {
        this.props = props
    }

    @computed get tickFontSize() {
        return 0.9 * this.props.fontSize
    }

    @computed get label(): TextWrap | undefined {
        const { props, height } = this
        return props.labelText
            ? new TextWrap({
                  maxWidth: height,
                  fontSize: 0.7 * props.fontSize,
                  text: props.labelText
              })
            : undefined
    }

    @computed get labelOffset(): number {
        return this.label ? this.label.height + 10 : 0
    }

    @computed get width() {
        const { props, labelOffset } = this
        const longestTick = maxBy(
            props.scale.getFormattedTicks(),
            tick => tick.length
        )
        return (
            Bounds.forText(longestTick, { fontSize: this.tickFontSize }).width +
            labelOffset +
            5
        )
    }

    @computed get height() {
        return this.props.scale.rangeSize
    }

    @computed get scale(): AxisScale {
        return this.props.scale
    }

    @computed get baseTicks(): Tickmark[] {
        return this.scale.getTickValues().filter(tick => !tick.gridLineOnly)
    }

    // calculates coordinates for ticks, sorted by priority
    @computed get tickPlacements() {
        const { scale } = this
        return sortBy(this.baseTicks, tick => tick.priority).map(tick => {
            const bounds = Bounds.forText(
                scale.tickFormat(tick.value, {
                    ...this.tickFormattingOptions,
                    isFirstOrLastTick: !!tick.isFirstOrLastTick
                }),
                {
                    fontSize: this.tickFontSize
                }
            )
            return {
                tick: tick.value,
                bounds: bounds.extend({
                    y: scale.place(tick.value),
                    // x placement doesn't really matter here, so we're using
                    // 1 for simplicity
                    x: 1
                }),
                isHidden: false
            }
        })
    }

    @computed get ticks(): number[] {
        const { tickPlacements } = this
        for (let i = 0; i < tickPlacements.length; i++) {
            for (let j = i + 1; j < tickPlacements.length; j++) {
                const t1 = tickPlacements[i],
                    t2 = tickPlacements[j]
                if (t1 === t2 || t1.isHidden || t2.isHidden) continue
                if (t1.bounds.intersects(t2.bounds)) {
                    t2.isHidden = true
                }
            }
        }

        return sortBy(tickPlacements.filter(t => !t.isHidden).map(t => t.tick))
    }

    @computed get tickFormattingOptions() {
        return this.scale.getTickFormattingOptions()
    }
}

@observer
export class VerticalAxisView extends React.Component<{
    bounds: Bounds
    axis: VerticalAxis
    isInteractive: boolean
}> {
    @computed get controls() {
        const { bounds, axis } = this.props
        const { scale } = axis
        const showControls =
            this.props.isInteractive && scale.scaleTypeOptions.length > 1
        if (!showControls) return undefined
        return (
            <ControlsOverlay id="vertical-scale-selector" paddingTop={18}>
                <ScaleSelector
                    x={bounds.left}
                    y={bounds.top - 34}
                    scaleTypeConfig={scale}
                />
            </ControlsOverlay>
        )
    }

    render() {
        const { bounds, axis } = this.props
        const { scale, ticks, label, tickFormattingOptions } = axis
        const textColor = "#666"

        return (
            <g className="VerticalAxis">
                {label &&
                    label.render(
                        -bounds.centerY - label.width / 2,
                        bounds.left,
                        { transform: "rotate(-90)" }
                    )}
                {ticks.map((tick, i) => (
                    <text
                        key={i}
                        x={(bounds.left + axis.width - 5).toFixed(2)}
                        y={scale.place(tick)}
                        fill={textColor}
                        dominantBaseline="middle"
                        textAnchor="end"
                        fontSize={axis.tickFontSize}
                    >
                        {scale.tickFormat(tick, tickFormattingOptions)}
                    </text>
                ))}
                {this.controls}
            </g>
        )
    }
}
