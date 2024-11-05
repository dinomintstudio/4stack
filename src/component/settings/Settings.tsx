import { Accessor, Component, For, Match, Switch } from 'solid-js'
import { Schema, StructuredValue, conformSchema, flattenValue } from '../../schema'
import './Settings.module.scss'

export type SettingsProps = {
    schema: Schema
    initialSettings: Accessor<any>
    onChange?: (settings: any) => void
}

export const Settings: Component<SettingsProps> = props => {
    const structuredValue = () => conformSchema(props.initialSettings(), props.schema)
    return (
        <div class="Settings">
            <table>
                <thead />
                <tbody>
                    <Section value={structuredValue()} onChange={v => props.onChange?.(flattenValue(v))} />
                </tbody>
            </table>
        </div>
    )
}

export type SectionProps = {
    value: StructuredValue
    onChange?: (v: StructuredValue) => void
}

const Section: Component<SectionProps> = props => {
    const onChange = (key: string, v: StructuredValue) => {
        props.onChange?.({ ...props.value, items: { ...(props.value as any).items, [key]: v } } as any)
    }
    return (
        <>
            <Switch>
                <Match when={props.value.type === 'group'}>
                    <tr>
                        <td>{props.value.schema.title}</td>
                    </tr>
                    <For each={Object.entries(props.value.type === 'group' && props.value.items)}>
                        {([key, value]) => <Section value={value} onChange={v => onChange(key, v)} />}
                    </For>
                </Match>
                <Match when={true}>
                    <Setting setting={props.value} onChange={props.onChange} />
                </Match>
            </Switch>
        </>
    )
}

export type SettingProps = {
    setting: StructuredValue
    onChange?: (v: StructuredValue) => void
}

const Setting: Component<SettingProps> = props => {
    const onNumInput = (e: Event) => {
        const v = (e.target as HTMLInputElement).value
        const n = Number.parseInt(v)
        if (Number.isNaN(n)) return
        props.onChange?.({ ...props.setting, value: n } as any)
    }
    const onKeyInput = (e: Event) => {
        const value = (e.target as HTMLInputElement).value
        props.onChange?.({ ...props.setting, value } as any)
    }
    return (
        <tr title={props.setting.schema.description}>
            <td>{props.setting.schema.title}</td>
            <td>
                <Switch>
                    <Match when={props.setting.type === 'number'}>
                        <input
                            type="number"
                            value={props.setting.type === 'number' && props.setting.value}
                            onInput={onNumInput}
                        />
                    </Match>
                    <Match when={props.setting.type === 'key'}>
                        <input
                            type="text"
                            value={props.setting.type === 'key' && props.setting.value}
                            onInput={onKeyInput}
                        />
                    </Match>
                </Switch>
            </td>
        </tr>
    )
}