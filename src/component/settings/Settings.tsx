import { Accessor, Component, For, Match, Switch } from 'solid-js'
import { Schema, StructuredValue, conformSchema } from '../../schema'
import './Settings.module.scss'

export type SettingsProps = {
    schema: Schema
    settings: Accessor<any>
}

export const Settings: Component<SettingsProps> = props => {
    return (
        <div class="Settings">
            <table>
                <thead />
                <tbody>
                    <Section value={conformSchema(props.settings(), props.schema)} />
                </tbody>
            </table>
        </div>
    )
}

export type SectionProps = {
    value: StructuredValue
}

const Section: Component<SectionProps> = props => {
    return (
        <>
            <Switch>
                <Match when={props.value.type === 'group'}>
                    <tr>
                        <td>{props.value.schema.title}</td>
                    </tr>
                    <For each={Object.values(props.value.type === 'group' && props.value.items)}>
                        {value => <Section value={value} />}
                    </For>
                </Match>
                <Match when={true}>
                    <Setting setting={props.value} />
                </Match>
            </Switch>
        </>
    )
}

export type SettingProps = {
    setting: StructuredValue
}

const Setting: Component<SettingProps> = props => {
    return (
        <tr title={props.setting.schema.description}>
            <td>{props.setting.schema.title}</td>
            <td>{props.setting.type !== 'group' && props.setting.value}</td>
        </tr>
    )
}
