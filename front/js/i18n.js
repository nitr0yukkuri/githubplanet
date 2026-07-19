const translations = {
    ja: {
        common: {
            appTitle: 'GitHub Planet',
            backToPlanet: '＜ 惑星に戻る',
            loading: '読み込み中...',
            loginRequired: 'ログインが必要です。',
            back: '戻る',
            disclaimer: '※GitHub PlanetはGitHub公式とは一切関係ありません。',
            languageToggle: 'EN',
            languageToggleLabel: 'Switch language to English',
            status: 'ステータス:'
        },
        meta: {
            description: 'GitHubの活動履歴からあなただけの惑星を生成しよう。',
            ogDescription: 'あなたのコードが、星になる。GitHubの活動履歴からあなただけの惑星を生成しよう。'
        },
        home: {
            welcomeTitle: 'GitHub Planetへようこそ',
            welcomeBody: 'これはあなたのGitHubでの活動に応じて育つ惑星を楽しめる<br>サイトです。使用言語とコントリビューション数によって惑星の色や輝きなどが変わり、自分だけの星を育てられます。<br>人の惑星を見に行くこともできます。<br>賑やかな宇宙を目指して日頃の開発を頑張りましょう！',
            empty: 'まだ何もありません...',
            login: '星を誕生させる',
            searchPlanet: '惑星を探す',
            menu: 'メニュー',
            achievements: '実績',
            settings: '設定',
            card: 'カード',
            githubProfile: 'GitHubプロフィールを見る',
            nextRandom: '違う星を見に行く',
            statusTitle: '星のステータス',
            contributions: 'コントリビューション',
            toggleDetails: '詳細パネルの切り替え',
            visitUser: '誰かの星を見に行く',
            visitRandom: 'ランダムで星を見に行く',
            returnMine: '自分の星に戻る',
            unnamedPlanet: '名もなき星',
            ownerPlanet: '{username} の星',
            promptUsername: '見に行きたいGitHubユーザー名を入力してください:',
            userPlanetNotFound: 'そのユーザーの惑星は見つかりませんでした。\n(GitHub Planetにログインしたことがあるユーザーのみ表示できます)',
            searchError: '惑星の検索中にエラーが発生しました',
            networkError: '通信エラーが発生しました',
            randomNotFound: '他の惑星が見つかりませんでした',
            myPlanetNotFound: '自分の星が見つかりませんでした（ログインしていない可能性があります）',
            genericError: 'エラーが発生しました',
            pageTitleRandom: '{username} の星 (Random)',
            newAchievementsTitle: '新しく実績を{count}件解除しました',
            contributionGrowthTitle: '前回ログインから{count}コントリビューション増えました！',
            newAchievementsMore: 'ほか{count}件',
            viewAchievements: '実績を見る',
            closeAchievementNotice: '通知を閉じる'
        },
        achievements: {
            pageTitle: '実績 - GitHub Planet',
            title: 'Achievement',
            rate: 'Achievement Rate',
            type: 'Type:',
            user: 'User:',
            loadingData: '実績データを読み込み中...',
            backToList: '＜ 実績一覧に戻る',
            detailTitle: 'タイトル',
            unlockCondition: '実績解除条件',
            detailDescription: 'ここに解除条件の説明が入ります。',
            reward: 'UNLOCK TITLE',
            detailLink: '詳細を確認する >',
            notLoggedInHtml: 'ログインしていません。<a href="/">ホーム</a>に戻ってログインしてください。',
            unknownUser: '不明なユーザー',
            unlocked: 'Unlocked ({date})',
            unlockedList: 'Unlocked: {date}',
            locked: 'Locked',
            lockIcon: '🔒',
            names: {
                OCTOCAT_FRIEND: '星界の盟友',
                VELOCITY_STAR: '光速の星',
                OS_CONTRIBUTOR: '銀河の貢献者',
                STARGAZER: '星を見上げる者',
                POLYGLOT_PIONEER: '多言語の開拓者',
                FIRST_COMMIT: '星の産声',
                FIRST_PLANET: '最初の星',
                COMMIT_100: '星の歩み',
                COMMIT_500: '軌道の旅人',
                COMMIT_1000: '星雲の航海者',
                CONTRIBUTION_10000: '銀河に名を刻む者'
            },
            descriptions: {
                OCTOCAT_FRIEND: '長い間この宇宙を旅し、登録から1年以上が経過した。',
                VELOCITY_STAR: '爆発的な開発スピードで宇宙を駆け抜け、週間50コミット以上を記録した。',
                OS_CONTRIBUTOR: '他の星系に文明をもたらし、他リポジトリへの貢献を果たした。',
                STARGAZER: '多くの輝きを知り、または自身が輝き、Star数10以上を達成した。',
                POLYGLOT_PIONEER: '多様な技術を操り、5種類以上の言語で彩り豊かな惑星を築き上げた。',
                FIRST_COMMIT: 'GitHub Planetにログイン後、初めてのコミットを記録した。',
                FIRST_PLANET: '初めて自分の惑星を宇宙に誕生させた。',
                COMMIT_100: 'GitHubで100回のコントリビューションを記録した。',
                COMMIT_500: 'GitHubで500回のコントリビューションを記録した。',
                COMMIT_1000: 'GitHubで1000回のコントリビューションを記録した。',
                CONTRIBUTION_10000: 'GitHubで10000回のコントリビューションを記録した。'
            },
            rewards: {
                FIRST_PLANET: { prefix: '始まりの', suffix: '創造主' },
                FIRST_COMMIT: { prefix: '記念すべき', suffix: '第一歩' },
                VELOCITY_STAR: { prefix: '光速の', suffix: '彗星' },
                OS_CONTRIBUTOR: { prefix: '銀河の', suffix: '貢献者' },
                STARGAZER: { prefix: '輝く', suffix: '一番星' },
                POLYGLOT_PIONEER: { prefix: '多才な', suffix: '翻訳家' },
                OCTOCAT_FRIEND: { prefix: '古参の', suffix: '盟友' },
                COMMIT_100: { prefix: '星を歩む', suffix: '探索者' },
                COMMIT_500: { prefix: '軌道を巡る', suffix: '旅人' },
                COMMIT_1000: { prefix: '星雲を渡る', suffix: '航海者' },
                CONTRIBUTION_10000: { prefix: '銀河に名を刻む', suffix: '伝説' }
            }
        },
        settings: {
            pageTitle: '設定 - GitHub Planet',
            heading: 'Settings',
            titleEditor: '称号の変更',
            description: '実績を解除すると新しい言葉が増えます。',
            save: '設定を保存する',
            saved: '称号を保存しました！',
            saveFailed: '保存に失敗しました。',
            networkError: '通信エラーが発生しました。'
        },
        card: {
            pageTitle: 'GitHub Planet Card',
            language: 'LANGUAGE',
            contributions: 'CONTRIBUTIONS',
            systemStatus: 'SYSTEM STATUS',
            online: '● ONLINE',
            share: '👇 下のURLをコピーしてgithubのプロフィールに貼ろう！',
            copy: 'コピー'
        }
    },
    en: {
        common: {
            appTitle: 'GitHub Planet',
            backToPlanet: '< Back to Planet',
            loading: 'Loading...',
            loginRequired: 'Login is required.',
            back: 'Back',
            disclaimer: 'GitHub Planet is not affiliated with GitHub.',
            languageToggle: 'JP',
            languageToggleLabel: 'Switch language to Japanese',
            status: 'Status:'
        },
        meta: {
            description: 'Generate your own planet from your GitHub activity.',
            ogDescription: 'Your code becomes a star. Generate your own planet from your GitHub activity.'
        },
        home: {
            welcomeTitle: 'Welcome to GitHub Planet',
            welcomeBody: 'GitHub Planet turns your GitHub activity into a growing planet.<br>Your languages and contribution count shape its color, glow, and character, so you can raise a star that is uniquely yours.<br>You can also visit other people\'s planets.<br>Keep building, and help this little universe grow brighter.',
            empty: 'Nothing here yet...',
            login: 'Create your star',
            searchPlanet: 'Find a planet',
            menu: 'Menu',
            achievements: 'Achievements',
            settings: 'Settings',
            card: 'Card',
            githubProfile: 'View GitHub profile',
            nextRandom: 'Next random planet',
            statusTitle: 'Star Status',
            contributions: 'Contributions',
            toggleDetails: 'Toggle details panel',
            visitUser: 'Visit a user planet',
            visitRandom: 'Visit a random planet',
            returnMine: 'Back to my planet',
            unnamedPlanet: 'Nameless Star',
            ownerPlanet: '{username}\'s star',
            promptUsername: 'Enter a GitHub username to visit:',
            userPlanetNotFound: 'That user\'s planet was not found.\n(Only users who have logged in to GitHub Planet can be displayed.)',
            searchError: 'An error occurred while searching for the planet.',
            networkError: 'A network error occurred.',
            randomNotFound: 'No other planets were found.',
            myPlanetNotFound: 'Your planet was not found. You may not be logged in.',
            genericError: 'An error occurred.',
            pageTitleRandom: '{username}\'s star (Random)',
            newAchievementsTitle: '{count} new achievements unlocked',
            contributionGrowthTitle: '{count} contributions since your last login!',
            newAchievementsMore: '+{count} more',
            viewAchievements: 'View achievements',
            closeAchievementNotice: 'Close notification'
        },
        achievements: {
            pageTitle: 'Achievements - GitHub Planet',
            title: 'Achievement',
            rate: 'Achievement Rate',
            type: 'Type:',
            user: 'User:',
            loadingData: 'Loading achievement data...',
            backToList: '< Back to achievements',
            detailTitle: 'Title',
            unlockCondition: 'Unlock Condition',
            detailDescription: 'The unlock condition description appears here.',
            reward: 'UNLOCK TITLE',
            detailLink: 'View details >',
            notLoggedInHtml: 'You are not logged in. Return <a href="/">home</a> and sign in.',
            unknownUser: 'Unknown user',
            unlocked: 'Unlocked ({date})',
            unlockedList: 'Unlocked: {date}',
            locked: 'Locked',
            lockIcon: '🔒',
            names: {
                OCTOCAT_FRIEND: 'Cosmic Ally',
                VELOCITY_STAR: 'Velocity Star',
                OS_CONTRIBUTOR: 'Galactic Contributor',
                STARGAZER: 'Stargazer',
                POLYGLOT_PIONEER: 'Polyglot Pioneer',
                FIRST_COMMIT: 'First Signal',
                FIRST_PLANET: 'First Planet',
                COMMIT_100: 'Stellar Footsteps',
                COMMIT_500: 'Orbital Traveler',
                COMMIT_1000: 'Nebula Voyager',
                CONTRIBUTION_10000: 'Galactic Legend'
            },
            descriptions: {
                OCTOCAT_FRIEND: 'Traveled this universe for a long time, with more than a year since registration.',
                VELOCITY_STAR: 'Blazed through space with explosive development speed by recording 50 or more commits in a week.',
                OS_CONTRIBUTOR: 'Brought civilization to other star systems by contributing to other repositories.',
                STARGAZER: 'Recognized many lights, or became one yourself, by reaching 10 or more stars.',
                POLYGLOT_PIONEER: 'Built a richly colored planet with five or more programming languages.',
                FIRST_COMMIT: 'Recorded your first commit after logging in to GitHub Planet.',
                FIRST_PLANET: 'Created your own planet in this universe for the first time.',
                COMMIT_100: 'Recorded 100 contributions on GitHub.',
                COMMIT_500: 'Recorded 500 contributions on GitHub.',
                COMMIT_1000: 'Recorded 1,000 contributions on GitHub.',
                CONTRIBUTION_10000: 'Recorded 10,000 contributions on GitHub.'
            },
            rewards: {
                FIRST_PLANET: { prefix: 'Genesis', suffix: 'Creator' },
                FIRST_COMMIT: { prefix: 'Memorable', suffix: 'First Step' },
                VELOCITY_STAR: { prefix: 'Lightspeed', suffix: 'Comet' },
                OS_CONTRIBUTOR: { prefix: 'Galactic', suffix: 'Contributor' },
                STARGAZER: { prefix: 'Radiant', suffix: 'First Star' },
                POLYGLOT_PIONEER: { prefix: 'Versatile', suffix: 'Translator' },
                OCTOCAT_FRIEND: { prefix: 'Veteran', suffix: 'Ally' },
                COMMIT_100: { prefix: 'Stellar', suffix: 'Explorer' },
                COMMIT_500: { prefix: 'Orbital', suffix: 'Traveler' },
                COMMIT_1000: { prefix: 'Nebula', suffix: 'Voyager' },
                CONTRIBUTION_10000: { prefix: 'Galactic', suffix: 'Legend' }
            }
        },
        settings: {
            pageTitle: 'Settings - GitHub Planet',
            heading: 'Settings',
            titleEditor: 'Title Settings',
            description: 'Unlock achievements to collect new words.',
            save: 'Save settings',
            saved: 'Title saved.',
            saveFailed: 'Failed to save.',
            networkError: 'A network error occurred.'
        },
        card: {
            pageTitle: 'GitHub Planet Card',
            language: 'LANGUAGE',
            contributions: 'CONTRIBUTIONS',
            systemStatus: 'SYSTEM STATUS',
            online: '● ONLINE',
            share: '👇 Copy the URL below and paste it into your GitHub profile.',
            copy: 'Copy'
        }
    }
};

function isEnglishPath() {
    return /^\/(en|english)(\/|$)/.test(window.location.pathname);
}

function getNestedValue(key, lang = getLanguage()) {
    return key.split('.').reduce((value, part) => value?.[part], translations[lang]);
}

function format(value, params = {}) {
    if (typeof value !== 'string') return value;
    return value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '');
}

export function getLanguage() {
    return isEnglishPath() ? 'en' : 'ja';
}

export function t(key, params = {}) {
    const value = getNestedValue(key) ?? getNestedValue(key, 'en') ?? key;
    return format(value, params);
}

export function getTranslation(key) {
    return getNestedValue(key) ?? getNestedValue(key, 'en');
}

export function localizedTitlePart(value, type) {
    if (getLanguage() !== 'en') return value;
    const japaneseRewards = translations.ja.achievements.rewards;
    const englishRewards = translations.en.achievements.rewards;
    const rewardKey = Object.keys(japaneseRewards).find(
        (key) => japaneseRewards[key][type] === value
    );

    if (type === 'prefix' && value === '名もなき') return 'Nameless';
    if (type === 'suffix' && value === '旅人') return 'Traveler';
    return englishRewards[rewardKey]?.[type] || value;
}

export function localizedTitle(activeTitle) {
    if (!activeTitle) return '';
    const prefix = localizedTitlePart(activeTitle.prefix, 'prefix');
    const suffix = localizedTitlePart(activeTitle.suffix, 'suffix');

    return `${prefix} ${suffix}`;
}

export function localizedPlanetName(data) {
    if (getLanguage() !== 'en') {
        return data.planetName || t('home.unnamedPlanet');
    }

    const adjectives = {
        JavaScript: 'Flexible', TypeScript: 'Resilient', Python: 'Wise', HTML: 'Structural', CSS: 'Elegant',
        Ruby: 'Passionate', Java: 'Immutable', C: 'Primal', 'C++': 'High-Speed', 'C#': 'Sharp',
        Go: 'Swift', Rust: 'Secure', PHP: 'Elephantine', Swift: 'Rapid', Kotlin: 'Serene',
        Shell: 'Automated', Dart: 'Daring', Scala: 'Spiraling', Perl: 'Pearlescent', Lua: 'Moonlit',
        Haskell: 'Pure', R: 'Statistical', Julia: 'Scientific', Vue: 'Reactive', Dockerfile: 'Ark-Bound',
        Svelte: 'Constructed', Elixir: 'Alchemical', ObjectiveC: 'Objective', VimScript: 'Operational',
        Unknown: 'Mysterious'
    };
    const colorNames = {
        '#f0db4f': 'Golden', '#007acc': 'Azure', '#306998': 'Deep-Sea', '#e34c26': 'Blazing',
        '#563d7c': 'Amethyst', '#cc342d': 'Crimson', '#b07219': 'Earthen', '#555555': 'Steel',
        '#f34b7d': 'Cherry-Blossom', '#178600': 'Jade', '#00add8': 'Glacial', '#dea584': 'Sandy',
        '#4f5d95': 'Indigo', '#f05138': 'Vermilion', '#a97bff': 'Lightning', '#808080': 'Mystic',
        '#89e051': 'Verdant', '#00b4ab': 'Clearwater', '#c22d40': 'Rose', '#0298c3': 'Cerulean',
        '#000080': 'Abyssal', '#5e5086': 'Night-Sky', '#198ce7': 'Sky-Blue', '#a270ba': 'Wisteria',
        '#41b883': 'Meadow', '#384d54': 'Obsidian', '#ff3e00': 'Orange', '#6e4a7e': 'Grape',
        '#438eff': 'Blue-Sky', '#199f4b': 'Evergreen'
    };
    const adjective = adjectives[data.mainLanguage] || adjectives.Unknown;
    const color = colorNames[String(data.planetColor || '').toLowerCase()] || colorNames['#808080'];
    const commits = Number(data.totalCommits) || 0;
    const starClass = commits > 1000 ? 'Imperial Star' : commits > 500 ? 'Giant Star' : 'Star';

    return `${adjective} ${color} ${starClass}`;
}

export function localizedPath(path) {
    if (!isEnglishPath()) return path;
    if (path === '/') return '/en';
    return `/en${path}`;
}

function applyLocalizedLinks(root) {
    const links = [
        ['a[href="/"]', '/'],
        ['a[href="/login"]', '/login'],
        ['a[href="/achievements"]', '/achievements'],
        ['a[href="/settings"]', '/settings']
    ];

    links.forEach(([selector, path]) => {
        root.querySelectorAll(selector).forEach((element) => {
            element.setAttribute('href', localizedPath(path));
        });
    });

    const cardLink = document.getElementById('card-link');
    if (cardLink && cardLink.getAttribute('href')?.startsWith('/card.html')) {
        const url = new URL(cardLink.getAttribute('href'), window.location.origin);
        cardLink.href = `${localizedPath('/card.html')}${url.search}`;
    }
}

export function applyI18n(root = document) {
    const lang = getLanguage();
    document.documentElement.lang = lang;
    document.title = t(document.body?.dataset.i18nTitle || 'home.pageTitle');

    root.querySelectorAll('[data-i18n]').forEach((element) => {
        element.textContent = t(element.dataset.i18n);
    });

    root.querySelectorAll('[data-i18n-html]').forEach((element) => {
        element.innerHTML = t(element.dataset.i18nHtml);
    });

    root.querySelectorAll('[data-i18n-attr]').forEach((element) => {
        element.dataset.i18nAttr.split(',').forEach((entry) => {
            const [attr, key] = entry.split(':').map((part) => part.trim());
            if (attr && key) element.setAttribute(attr, t(key));
        });
    });

    applyLocalizedLinks(root);
}
