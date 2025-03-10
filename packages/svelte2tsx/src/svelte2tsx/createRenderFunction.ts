import MagicString from 'magic-string';
import { Node } from 'estree-walker';
import { ComponentEvents } from './nodes/ComponentEvents';
import { InstanceScriptProcessResult } from './processInstanceScriptContent';
import { surroundWithIgnoreComments } from '../utils/ignore';

export interface CreateRenderFunctionPara extends InstanceScriptProcessResult {
    str: MagicString;
    scriptTag: Node;
    scriptDestination: number;
    slots: Map<string, Map<string, string>>;
    events: ComponentEvents;
    isTsFile: boolean;
    uses$$SlotsInterface: boolean;
    mode?: 'ts' | 'dts';
}

export function createRenderFunction({
    str,
    scriptTag,
    scriptDestination,
    slots,
    events,
    exportedNames,
    isTsFile,
    uses$$props,
    uses$$restProps,
    uses$$slots,
    uses$$SlotsInterface,
    generics,
    mode
}: CreateRenderFunctionPara) {
    const htmlx = str.original;
    let propsDecl = '';

    if (uses$$props) {
        propsDecl += ' let $$props = __sveltets_2_allPropsType();';
    }
    if (uses$$restProps) {
        propsDecl += ' let $$restProps = __sveltets_2_restPropsType();';
    }

    if (uses$$slots) {
        propsDecl +=
            ' let $$slots = __sveltets_2_slotsType({' +
            Array.from(slots.keys())
                .map((name) => `'${name}': ''`)
                .join(', ') +
            '});';
    }

    const slotsDeclaration =
        slots.size > 0 && mode !== 'dts'
            ? '\n' +
              surroundWithIgnoreComments(
                  ';const __sveltets_createSlot = __sveltets_2_createCreateSlot' +
                      (uses$$SlotsInterface ? '<$$Slots>' : '') +
                      '();'
              )
            : '';

    if (scriptTag) {
        //I couldn't get magicstring to let me put the script before the <> we prepend during conversion of the template to jsx, so we just close it instead
        const scriptTagEnd = htmlx.lastIndexOf('>', scriptTag.content.start) + 1;
        str.overwrite(scriptTag.start, scriptTag.start + 1, ';');
        if (generics.genericsAttr) {
            let start = generics.genericsAttr.value[0].start;
            let end = generics.genericsAttr.value[0].end;
            if (htmlx.charAt(start) === '"' || htmlx.charAt(start) === "'") {
                start++;
                end--;
            }
            str.overwrite(scriptTag.start + 1, start - 1, `function render`);
            str.overwrite(start - 1, start, `<`); // if the generics are unused, only this char is colored opaque
            if (end < scriptTagEnd) {
                str.overwrite(end, scriptTagEnd, `>() {${propsDecl}\n`);
            } else {
                str.prependRight(end, `>() {${propsDecl}\n`);
            }
        } else {
            str.overwrite(
                scriptTag.start + 1,
                scriptTagEnd,
                `function render${generics.toDefinitionString(true)}() {${propsDecl}\n`
            );
        }

        const scriptEndTagStart = htmlx.lastIndexOf('<', scriptTag.end - 1);
        // wrap template with callback
        str.overwrite(scriptEndTagStart, scriptTag.end, `${slotsDeclaration};\nasync () => {`, {
            contentOnly: true
        });
    } else {
        str.prependRight(
            scriptDestination,
            `;function render() {` + `${propsDecl}${slotsDeclaration}\nasync () => {`
        );
    }

    const slotsAsDef = uses$$SlotsInterface
        ? '{} as unknown as $$Slots'
        : '{' +
          Array.from(slots.entries())
              .map(([name, attrs]) => {
                  const attrsAsString = Array.from(attrs.entries())
                      .map(([exportName, expr]) =>
                          exportName.startsWith('__spread__')
                              ? `...${expr}`
                              : `${exportName}:${expr}`
                      )
                      .join(', ');
                  return `'${name}': {${attrsAsString}}`;
              })
              .join(', ') +
          '}';

    const returnString =
        `\nreturn { props: ${exportedNames.createPropsStr(
            isTsFile,
            uses$$props || uses$$restProps
        )}` +
        `, slots: ${slotsAsDef}` +
        `, events: ${events.toDefString()} }}`;

    // wrap template with callback
    str.append('};');

    str.append(returnString);
}
