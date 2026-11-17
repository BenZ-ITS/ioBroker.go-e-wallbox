// Names of channels and states in all languages ioBroker supports.
// English and German are maintained by hand in src/i18n, the other languages by `npm run translate`.
import de from '../i18n/de.json';
import en from '../i18n/en.json';
import es from '../i18n/es.json';
import fr from '../i18n/fr.json';
import it from '../i18n/it.json';
import nl from '../i18n/nl.json';
import pl from '../i18n/pl.json';
import pt from '../i18n/pt.json';
import ru from '../i18n/ru.json';
import uk from '../i18n/uk.json';
import zhCn from '../i18n/zh-cn.json';

/** All language files, English first */
export const LANGUAGES: Readonly<Record<ioBroker.Languages, Readonly<Record<string, string>>>> = {
    en,
    de,
    ru,
    pt,
    nl,
    fr,
    it,
    es,
    pl,
    uk,
    'zh-cn': zhCn,
};

/**
 * Name of a channel or state in all languages.
 *
 * @param key channel id, state id below the device or `instance.<id>`
 */
export function translatedName(key: string): ioBroker.Translated {
    const english = en[key as keyof typeof en];
    if (english === undefined) {
        throw new Error(`No name defined for "${key}"`);
    }
    const name = { en: english } as ioBroker.Translated;
    for (const [language, words] of Object.entries(LANGUAGES) as [ioBroker.Languages, Record<string, string>][]) {
        name[language] = words[key] ?? english;
    }
    return name;
}
