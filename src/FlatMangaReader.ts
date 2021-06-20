import {
    Chapter,
    ChapterDetails,
    HomeSection,
    LanguageCode,
    Manga,
    MangaTile,
    MangaUpdates,
    PagedResults, RequestHeaders,
    SearchRequest,
    Source, TagSection,

} from "paperback-extensions-common"

import { Parser, UpdatedManga } from './FlatMangaReaderParser'

export abstract class FlatMangaReader extends Source {
    /**
     * The URL of the website. Eg. https://mangadark.com without a trailing slash
     */
    abstract baseUrl: string

    /**
     * The language code which this source supports.
     */
    abstract languageCode: LanguageCode

    /**
     * The path that precedes a manga page not including the Madara URL.
     * Eg. for https://mangadark.com/manga/the-great-mage-returns-after-4000-years/ it would be 'manga'.
     * Used in all functions.
     */
    sourceTraversalPathName: string = "" //ADD A "/" AT THE END!

    sourceMangaDirectory: string = this.sourceTraversalPathName

    /**
     * Different Madara sources might have a slightly different selector which is required to parse out
     * each manga object while on a search result page. This is the selector
     * which is looped over. This may be overridden if required.
     */
    searchMangaSelector: string = "div.c-tabs-item__content"


    /**
    * Different websites require the url to end with an extension.
    * Eg. for https://manhuascan.com/manga-cherry-blossoms-after-winter.html it would require .html
    */
    fileExtention: string = ""

    /**
     * Set to true if your source has advanced search functionality built in.
     */
    hasAdvancedSearchPage: boolean = false

    //MANGA DETAILS SELECTORS
    mangaIconDomain: string = ""

    //CHAPTER SELECTORS

    /**
     * a
     */
    chapterQuerySelector: string = "div#tab-chapper"

    chapterItemSelector: string = 'tr'

    chapterUrlSelector: string = "a"

    chapterTimeSelector: string = "time"

    chapterNameSelector: string = "b"

    //CHAPTER DETAILS SELECTORS

    pageListImageSelector: string = "img.chapter-img"


    /**
    * Helps with CloudFlare for some sources, makes it worse for others; override with empty string if the latter is true
    */
    userAgentRandomizer: string = `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:77.0) Gecko/20100101 Firefox/78.0${Math.floor(Math.random() * 100000)}`

    requestManager = createRequestManager({
        requestsPerSecond: 2.5,
        requestTimeout: 20000,
    });

    parser = new Parser();

    getMangaShareUrl(mangaId: string): string {
        return `${this.baseUrl}/${this.sourceTraversalPathName}${mangaId}` + this.fileExtention;
    }

    async getMangaDetails(mangaId: string): Promise<Manga> {
        const request = createRequestObject({
            url: `${this.baseUrl}/${this.sourceTraversalPathName}${mangaId}`,
            method: 'GET',
            headers: this.constructHeaders({}),
            param: this.fileExtention
        });

        const data = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(data.status);
        const $ = this.cheerio.load(data.data);

        return this.parser.parseMangaDetails($, mangaId, this);
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = createRequestObject({
            url: `${this.baseUrl}/${this.sourceTraversalPathName}${mangaId}`,
            method: 'GET',
            headers: this.constructHeaders({}),
            param: this.fileExtention
        });

        const data = await this.requestManager.schedule(request, 1);
        this.CloudFlareError(data.status);
        const $ = this.cheerio.load(data.data);

        return this.parser.parseChapterList($, mangaId, this);
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = createRequestObject({
            url: `${this.baseUrl}/${chapterId}`,
            method: 'GET',
            headers: this.constructHeaders({}),
            param: this.fileExtention
        });

        const data = await this.requestManager.schedule(request, 1);
        this.CloudFlareError(data.status);
        const $ = this.cheerio.load(data.data);

        return this.parser.parseChapterDetails($, mangaId, chapterId, this);

    }

    async getTags(): Promise<TagSection[] | null> {
        const request = createRequestObject({
            url: `${this.baseUrl}`,
            method: "GET",
        });

        const response = await this.requestManager.schedule(request, 1);
        this.CloudFlareError(response.status);
        const $ = this.cheerio.load(response.data);;
        return this.parser.parseTags($);
    }

    async searchRequest(query: SearchRequest, metadata: any): Promise<PagedResults> {
        let page = metadata?.page ?? 0;
        const search = this.parser.generateSearch(query);
        const request = createRequestObject({
            url: `${this.baseUrl}/manga-list.html/?listType=pagination?name=${search}?page=${page}`,
            method: "GET",
        });

        const data = await this.requestManager.schedule(request, 1);
        this.CloudFlareError(data.status);
        const $ = this.cheerio.load(data.data);
        const manga = this.parser.parseSearchResults($, this);
        metadata = !this.parser.isLastPage($, "search_request") ? { page: page + 1 } : undefined;

        return createPagedResults({
            results: manga,
            metadata
        });
    }

    async filterUpdatedManga(mangaUpdatesFoundCallback: (updates: MangaUpdates) => void, time: Date, ids: string[]): Promise<void> {
        let page = 1;
        let updatedManga: UpdatedManga = {
            ids: [],
            loadMore: true,
        };

        while (updatedManga.loadMore) {
            const request = createRequestObject({
                url: `${this.baseUrl}/page/${page++}/`,
                method: "GET",
            });

            const response = await this.requestManager.schedule(request, 1)
            const $ = this.cheerio.load(response.data)

            updatedManga = this.parser.parseUpdatedManga($, time, ids, this)
            if (updatedManga.ids.length > 0) {
                mangaUpdatesFoundCallback(createMangaUpdates({
                    ids: updatedManga.ids
                }));
            }
        }

    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const section1 = createHomeSection({ id: 'popular_manga', title: 'Popular Items', view_more: true });
        const section2 = createHomeSection({ id: 'new_manga', title: 'New Items', view_more: true });
        const section3 = createHomeSection({ id: 'top_alltime', title: 'Top Alltime', view_more: false });
        const section4 = createHomeSection({ id: 'top_monthly', title: 'Top Monthly', view_more: false });
        const section5 = createHomeSection({ id: 'top_weekly', title: 'Top Weekly', view_more: false });

        const sections = [section1, section2, section3, section4, section5];

        const request = createRequestObject({
            url: this.baseUrl,
            method: "GET",
        });

        const response = await this.requestManager.schedule(request, 1);
        this.CloudFlareError(response.status);
        const $ = this.cheerio.load(response.data);
        this.parser.parseHomeSections($, sections, sectionCallback, this);
    }

    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults | null> {
        let page: number = metadata?.page ?? 1;
        let param = '';
        switch (homepageSectionId) {
            case "new_manga":
                param = `/manga/?page=${page}&order=latest`;
                break;
            case "latest_update":
                param = `/manga/?page=${page}&order=update`;
                break;
            case "top_manga":
                param = `/manga/?page=${page}&order=popular`;
                break;
            default:
                return Promise.resolve(null);;
        }

        const request = createRequestObject({
            url: `${this.baseUrl}`,
            method: "GET",
            param,
        });

        const response = await this.requestManager.schedule(request, 1);
        const $ = this.cheerio.load(response.data);

        const manga = this.parser.parseViewMore($, homepageSectionId, this);
        metadata = !this.parser.isLastPage($, "view_more") ? { page: page + 1 } : undefined;
        return createPagedResults({
            results: manga,
            metadata
        });
    }

    getCloudflareBypassRequest() {
        return createRequestObject({
            url: `${this.baseUrl}`,
            method: 'GET',
            headers: this.constructHeaders({})
        })
    }

    constructHeaders(headers: any, refererPath?: string): any {
        if (this.userAgentRandomizer !== '') {
            headers["user-agent"] = this.userAgentRandomizer;
        }
        headers["referer"] = `${this.baseUrl}${refererPath ?? ''}`;
        return headers;
    }

    globalRequestHeaders(): RequestHeaders {
        if (this.userAgentRandomizer !== '') {
            return {
                "referer": `${this.baseUrl}/`,
                "user-agent": this.userAgentRandomizer,
                "accept": "image/jpeg,image/png,image/*;q=0.8"
            }
        } else {
            return {
                "referer": `${this.baseUrl}/`,
                "accept": "image/jpeg,image/png,image/*;q=0.8"
            }
        }
    }

    CloudFlareError(status: any) {
        if (status == 503) {
            throw new Error('CLOUDFLARE BYPASS ERROR:\nPlease go to Settings > Sources > \<\The name of this source\> and press Cloudflare Bypass');
        }
    }

}
