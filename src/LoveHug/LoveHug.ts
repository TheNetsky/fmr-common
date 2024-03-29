import { LanguageCode, SourceInfo, TagType } from "paperback-extensions-common";
import { FlatMangaReader } from '../FlatMangaReader'

const LOVEHUG_DOMAIN = "https://lovehug.net"

export const LoveHugInfo: SourceInfo = {
    version: '1.0.0',
    name: 'LoveHug',
    description: 'Extension that pulls manga from LoveHug',
    author: 'Netsky',
    authorWebsite: 'http://github.com/TheNetsky',
    icon: "icon.png",
    hentaiSource: false,
    websiteBaseURL: LOVEHUG_DOMAIN,
    sourceTags: [
        {
            text: "Notifications",
            type: TagType.GREEN
        }
    ]
}

export class LoveHug extends FlatMangaReader {
    baseUrl: string = LOVEHUG_DOMAIN
    languageCode: LanguageCode = LanguageCode.ENGLISH
    //fileExtention: string = ".html"
    hasAdvancedSearchPage: boolean = true


    //----Manga Details Selectors
    mangaIconDomain: string = LOVEHUG_DOMAIN

    //----Chapters Selectors
    //chapterNameSelector: string = ""
    //chapterTimeSelector: string = ""
}
