import { createPlanetQueryService } from '../application/planet-query-service.js';
import { createAuthoredLanguageHistoryService } from '../application/authored-language-history-service.js';
import { createPlanetService } from '../application/planet-service.js';
import { createLanguageColorService } from '../application/language-color-service.js';
import { createMeteorService } from '../application/meteor-service.js';
import { LANGUAGE_COLORS } from '../domain/planet/constants.js';
import { EXTENSION_MAP } from '../domain/planet/language-extensions.js';
import { createAuthoredLanguageHistoryRepository } from '../infrastructure/database/authored-language-history-repository.js';
import { createLanguageColorRepository } from '../infrastructure/database/language-color-repository.js';
import { createPlanetRepository } from '../infrastructure/database/planet-repository.js';
import { createGeminiClient } from '../infrastructure/external/gemini-client.js';
import { createGithubClient } from '../infrastructure/external/github-client.js';

export function createApplicationServices({
    env, pool, httpClient, languageColorCache = {}, emitMeteor, queryCaches, modelListCache,
    githubClientId, githubClientSecret, callbackUrl, cacheDuration, onRandomQueryTiming, onRequestTiming
}) {
    const planetRepository = createPlanetRepository(pool, {
        onRandomQueryTiming: onRandomQueryTiming,
        randomQueryStrategy: env.RANDOM_QUERY_STRATEGY || 'indexed',
        randomSmallTableThreshold: Number.parseInt(
            env.RANDOM_QUERY_SMALL_TABLE_THRESHOLD || '256',
            10
        )
    });
    const languageColorStore = createLanguageColorRepository(pool);

    const geminiClient = createGeminiClient({
        axios: httpClient,
        apiKey: env.GEMINI_API_KEY,
        modelListCache,
        onRequestTiming: onRequestTiming
    });
    const languageColorService = createLanguageColorService({
        ask: geminiClient.ask, languageColors: LANGUAGE_COLORS, languageColorCache, languageColorStore
    });
    const githubClient = createGithubClient({
        axios: httpClient,
        clientId: githubClientId,
        clientSecret: githubClientSecret,
        callbackUrl,
        onRequestTiming: onRequestTiming
    });
    const planetService = createPlanetService({
        repository: planetRepository,
        githubClient,
        geminiClient,
        languageColorService,
        geminiApiKey: env.GEMINI_API_KEY
    });
    const meteorService = createMeteorService({
        languageColorService,
        extensionMap: EXTENSION_MAP,
        emitMeteor
    });
    const planetQueryService = planetRepository ? createPlanetQueryService({
        repository: planetRepository,
        githubClient,
        planetService,
        cacheDuration: cacheDuration,
        ...queryCaches
    }) : undefined;
    const authoredLanguageHistoryService = planetRepository ? createAuthoredLanguageHistoryService({
        repository: createAuthoredLanguageHistoryRepository(pool),
        githubClient
    }) : undefined;

    return { githubClient, geminiClient, languageColorService, planetService, meteorService, planetQueryService, authoredLanguageHistoryService };
}
