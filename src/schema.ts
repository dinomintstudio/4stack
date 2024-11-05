export type SchemaPrimitiveType = 'key' | 'number'

export type Schema = {
    title: string
    description?: string
} & (
    | {
          type: SchemaPrimitiveType
      }
    | {
          type: 'group'
          items: { [key: string]: Schema }
      }
)

export type StructuredValue =
    | {
          type: SchemaPrimitiveType
          schema: Schema
          value: any
      }
    | {
          type: 'group'
          schema: Schema
          items: { [key: string]: StructuredValue }
      }

export const conformSchema = (o: any, schema: Schema): StructuredValue => {
    if (schema.type === 'group') {
        if (typeof o !== 'object') throw Error(`not an object in group \`${schema.title}\``)
        return {
            type: 'group',
            schema,
            items: Object.fromEntries(
                Object.entries(schema.items).map(([key, itemSchema]) => {
                    if (!(key in o)) throw Error(`no property for key \`${key}\``)
                    const value = o[key]
                    if (itemSchema.type === 'group') {
                        return [key, conformSchema(value, itemSchema)]
                    } else {
                        return [key, { schema: itemSchema, value }]
                    }
                })
            )
        }
    } else {
        return { type: schema.type, schema, value: o }
    }
}
