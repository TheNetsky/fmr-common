import {
    Chapter,
    ChapterDetails,
    LanguageCode,
    Manga,
    MangaStatus,
    MangaTile,
    Tag,
    TagSection,
    HomeSection,
    SearchRequest,
} from "paperback-extensions-common";

export interface UpdatedManga {
    ids: string[];
    loadMore: boolean;
}

const entities = require("entities"); //Import package for decoding HTML entities

export class Parser {

    parseMangaDetails($: CheerioSelector, mangaId: string, source: any): Manga {
        const titles = [];
        //console.log($('li:last-of-type span[itemprop="name"]'))

        titles.push(this.decodeHTMLEntity($('li:last-of-type span[itemprop="name"]').text().trim())); //Main English title

        //Not all sites support this, add this later!
        //const altTitles = $("b:contains(Alternative Titles)").next().text().split(",");
        // for (const title of altTitles) {
        //    titles.push(this.decodeHTMLEntity(title.trim()));
        // }

        const author = $("li a.btn-info").text().trim();
        let image = source.mangaIconDomain + this.getImageSrc($('li:last-of-type img[itemprop="image"]'));

        const description = this.decodeHTMLEntity($("div.detail .content, div.row ~ div.row:has(h3:first-child) p, .summary-content p").text().trim());

        const arrayTags: Tag[] = [];

        /*
        for (const tag of $("a", "span.mgen").toArray()) {
            const label = $(tag).text().trim();
            const id = encodeURI($(tag).attr("href")?.trim()?.split("/genres/")[1].replace("/", "") ?? "");
            if (!label || !id) continue;
            arrayTags.push({ id: id, label: label });
        }
        */
        const tagSections: TagSection[] = [createTagSection({ id: '0', label: 'genres', tags: arrayTags.map(x => createTag(x)) })];

        const rawStatus = $("li a.btn-success").first()?.text().replace(/ /g, "");
        let status = MangaStatus.ONGOING;
        switch (rawStatus.toUpperCase()) {
            case 'ONGOING':
                status = MangaStatus.ONGOING;
                break;
            case 'COMPLETED':
                status = MangaStatus.COMPLETED;
                break;
            default:
                status = MangaStatus.ONGOING;
                break;
        }

        return createManga({
            id: mangaId,
            titles: titles,
            image: image ? image : "https://i.imgur.com/GYUxEX8.png",
            rating: 0,
            status: status,
            author: author,
            tags: tagSections,
            desc: description,
            //hentai: true
            hentai: false //MangaDex down
        });
    }

    parseChapterList($: CheerioSelector, mangaId: string, source: any): Chapter[] {
        const chapters: Chapter[] = [];
        const title = $('li:last-of-type span[itemprop="name"]').text().trim();
        let i = 1;
        for (const chapter of $(source.chapterItemSelector, source.chapterQuerySelector).toArray().reverse()) {
            const id = $(source.chapterUrlSelector, chapter).attr('href')?.replace(".html", "") ?? "";
            const chapTitle = $(source.chapterNameSelector, chapter).text().replace(title, "").trim();
            const date = this.parseDate($(source.chapterTimeSelector, chapter).text().trim());
            if (!id) continue;
            chapters.push(createChapter({
                id: id,
                mangaId,
                name: chapTitle,
                langCode: LanguageCode.ENGLISH, //Edit this later
                chapNum: i,
                time: date,
            }));
            i++
        }

        return chapters;
    }

    parseChapterDetails($: CheerioSelector, mangaId: string, chapterId: string, source: any): ChapterDetails {
        let pages: string[] = [];

        for (const page of $(source.pageListImageSelector).toArray()) {
            pages.push(this.getImageSrc($(page)));
        }

        const chapterDetails = createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages,
            longStrip: true
        });

        return chapterDetails;
    }
    //Todo
    parseTags($: CheerioSelector): TagSection[] {
        const arrayTags: Tag[] = [];
        for (const tag of $("li", "ul.genre").toArray()) {
            const label = $("a", tag).text().trim();
            const id = encodeURI($("a", tag).attr("href")?.trim()?.split("/genres/")[1].replace("/", "") ?? "");
            arrayTags.push({ id: id, label: label });
        }
        const tagSections: TagSection[] = [createTagSection({ id: '0', label: 'genres', tags: arrayTags.map(x => createTag(x)) })];
        return tagSections;
    }

    generateSearch = (query: SearchRequest): string => {
        let search: string = query.title ?? "";
        return encodeURI(search);
    }
    //Todo
    parseSearchResults($: CheerioSelector, source: any): MangaTile[] {
        const mangas: MangaTile[] = [];
        const collectedIds: string[] = [];

        for (const obj of $("div.bs", "div.listupd").toArray()) {
            const id = $("a", obj).attr('href')?.split("manga/")[1].replace("/", "") ?? "";
            const title = $("a", obj).attr('title');
            const image = this.getImageSrc($("img", obj))?.split("?resize")[0] ?? "";
            const subtitle = $("div.epxs", obj).text().trim();
            if (!collectedIds.includes(id) && id && title) {
                mangas.push(createMangaTile({
                    id,
                    image: image,
                    title: createIconText({ text: this.decodeHTMLEntity(title) }),
                    subtitleText: createIconText({ text: subtitle }),
                }));
                collectedIds.push(id);
            }
        }
        return mangas;
    }

    parseHomeSections($: CheerioStatic, sections: HomeSection[], sectionCallback: (section: HomeSection) => void, source: any) {
        for (const section of sections) sectionCallback(section);
        const collectedIds: string[] = [];

        //Popular
        const popularItems: MangaTile[] = [];
        for (const manga of $("div.item", "div.owl-carousel").toArray()) {
            const id = $("a", manga).attr('href')?.replace(".html", "") ?? "";
            let image = this.getImageSrc($("img", manga))?.split("?")[0];
            if (!image.startsWith("http") && source.mangaIconDomain) image = (source.mangaIconDomain + image);
            const title = $("h3", manga).text().trim();
            const subtitle = $("a.item-chapter", manga).text().trim();
            if (collectedIds.includes(id) || !id || !title) continue;
            popularItems.push(createMangaTile({
                id: id,
                image: image ? image : "https://i.imgur.com/GYUxEX8.png",
                title: createIconText({ text: this.decodeHTMLEntity(title) }),
                subtitleText: createIconText({ text: subtitle }),
            }));
            collectedIds.push(id);
        }
        sections[0].items = popularItems;
        sectionCallback(sections[0]);

    }

    parseViewMore = ($: CheerioStatic, homepageSectionId: string, source: any): MangaTile[] => {
        const manga: MangaTile[] = [];
        const collectedIds: string[] = [];

        for (const obj of $("div.bs", "div.listupd").toArray()) {
            const id = $("a", obj).attr('href')?.split("manga/")[1].replace("/", "") ?? "";
            const title = $("a", obj).attr('title');
            const image = this.getImageSrc($("img", obj))?.split("?resize")[0] ?? "";
            const subtitle = $("div.epxs", obj).text().trim();
            if (!collectedIds.includes(id) && id && title) {
                manga.push(createMangaTile({
                    id,
                    image: image ? image : "https://i.imgur.com/GYUxEX8.png",
                    title: createIconText({ text: this.decodeHTMLEntity(title) }),
                    subtitleText: createIconText({ text: subtitle }),
                }));
                collectedIds.push(id);
            }
        }
        return manga;
    }
    //todo
    parseUpdatedManga($: CheerioSelector, time: Date, ids: string[], source: any): UpdatedManga {
        const updatedManga: string[] = [];
        let loadMore = true;
        loadMore = false;

        return {
            ids: updatedManga,
            loadMore,
        }
    }

    isLastPage = ($: CheerioStatic, id: String): boolean => {
        let isLast = true;
        if (id == "view_more") {
            let hasNext = Boolean($("a.r")[0]);
            if (hasNext) isLast = false;
        }

        if (id == "search_request") {
            let hasNext = Boolean($("a.next.page-numbers")[0]);
            if (hasNext) isLast = false;
        }
        return isLast;
    }

    sortChapters(chapters: Chapter[]): Chapter[] {
        let sortedChapters = chapters.filter((obj, index, arr) => arr.map(mapObj => mapObj.id).indexOf(obj.id) === index);
        sortedChapters.sort((a, b) => (a.chapNum - b.chapNum) ? -1 : 1);
        return sortedChapters;
    }

    protected getImageSrc(imageObj: Cheerio | undefined): string {
        let image;
        if (typeof imageObj?.attr('data-src') != 'undefined') {
            image = imageObj?.attr('data-src');
        }
        else if (typeof imageObj?.attr('data-lazy-src') != 'undefined') {
            image = imageObj?.attr('data-lazy-src')
        }
        else if (typeof imageObj?.attr('srcset') != 'undefined') {
            image = imageObj?.attr('srcset')?.split(' ')[0] ?? '';
        }
        else {
            image = imageObj?.attr('src');
        }
        return encodeURI(decodeURI(this.decodeHTMLEntity(image?.trim() ?? '')));
    }

    protected parseDate = (date: string): Date => {
        date = date.toUpperCase();
        let time: Date;
        let number: number = Number((/\d*/.exec(date) ?? [])[0]);
        if (date.includes("LESS THAN AN HOUR") || date.includes("JUST NOW")) {
            time = new Date(Date.now());
        } else if (date.includes("YEAR") || date.includes("YEARS")) {
            time = new Date(Date.now() - (number * 31556952000));
        } else if (date.includes("MONTH") || date.includes("MONTHS")) {
            time = new Date(Date.now() - (number * 2592000000));
        } else if (date.includes("WEEK") || date.includes("WEEKS")) {
            time = new Date(Date.now() - (number * 604800000));
        } else if (date.includes("YESTERDAY")) {
            time = new Date(Date.now() - 86400000);
        } else if (date.includes("DAY") || date.includes("DAYS")) {
            time = new Date(Date.now() - (number * 86400000));
        } else if (date.includes("HOUR") || date.includes("HOURS")) {
            time = new Date(Date.now() - (number * 3600000));
        } else if (date.includes("MINUTE") || date.includes("MINUTES")) {
            time = new Date(Date.now() - (number * 60000));
        } else if (date.includes("SECOND") || date.includes("SECONDS")) {
            time = new Date(Date.now() - (number * 1000));
        } else {
            time = new Date(date);
        }
        return time;
    }

    protected decodeHTMLEntity(str: string): string {
        return entities.decodeHTML(str);
    }
}
