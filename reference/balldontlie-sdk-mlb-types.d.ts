export declare class APIError extends Error {
    status: number;
    constructor(message: string, status: number);
}
export interface Pagination {
    next_cursor: number;
    per_page: number;
}
export interface ApiResponse<T> {
    data: T;
    meta?: Pagination;
}
export interface NBATeam {
    id: number;
    conference: "East" | "West";
    division: "Atlantic" | "Central" | "Southeast" | "Northwest" | "Pacific" | "Southwest";
    city: string;
    name: string;
    full_name: string;
    abbreviation: string;
export interface MLBTeam {
    id: number;
    slug: string;
    abbreviation: string;
    display_name: string;
    short_display_name: string;
    name: string;
    location: string;
    league: "American" | "National";
    division: "East" | "Central" | "West";
}
export interface MLBPlayer {
    id: number;
    first_name: string;
    last_name: string;
    full_name: string;
    debut_year: number;
    jersey: string;
    college: string;
    position: string;
    active: boolean;
    birth_place: string;
    dob: string;
    age: number;
    height: string;
    weight: string;
    draft: string;
    bats_throws: string;
    team: MLBTeam;
}
export interface MLBGame {
    id: number;
    home_team_name: string;
    away_team_name: string;
    home_team: MLBTeam;
    away_team: MLBTeam;
    season: number;
    postseason: boolean;
    date: string;
    home_team_data: {
        hits: number;
        runs: number;
        errors: number;
        inning_scores: number[];
    };
    away_team_data: {
        hits: number;
        runs: number;
        errors: number;
        inning_scores: number[];
    };
    venue: string;
    attendance: number;
    status: string;
}
export interface MLBStats {
    player: MLBPlayer;
    game: MLBGame;
    team_name: string;
    at_bats: number;
    runs: number;
    hits: number;
    rbi: number;
    hr: number;
    bb: number;
    k: number;
    avg: number;
    obp: number;
    slg: number;
    ip: number;
    p_hits: number;
    p_runs: number;
    er: number;
    p_bb: number;
    p_k: number;
    p_hr: number;
    pitch_count: number;
    strikes: number;
    era: number;
}
export interface MLBStandings {
    team: MLBTeam;
    league_name: string;
    league_short_name: string;
    division_name: string;
    division_short_name: string;
    wins: number;
    losses: number;
    win_percent: number;
    games_behind: number;
    streak: number;
    last_ten_games: string;
    season: number;
}
export interface MLBSeasonStats {
    player: MLBPlayer;
    team_name: string;
    season: number;
    postseason: boolean;
    batting_gp: number;
    batting_ab: number;
    batting_r: number;
    batting_h: number;
    batting_avg: number;
    batting_2b: number;
    batting_3b: number;
    batting_hr: number;
    batting_rbi: number;
    batting_bb: number;
    batting_so: number;
    batting_sb: number;
    batting_obp: number;
    batting_slg: number;
    batting_ops: number;
    batting_war: number;
    pitching_gp: number;
    pitching_gs: number;
    pitching_w: number;
    pitching_l: number;
    pitching_era: number;
    pitching_sv: number;
    pitching_ip: number;
    pitching_h: number;
    pitching_er: number;
    pitching_hr: number;
    pitching_bb: number;
    pitching_k: number;
    pitching_war: number;
}
export interface MLBTeamSeasonStats {
    team: MLBTeam;
    team_name: string;
    postseason: boolean;
    season: number;
    gp: number;
    batting_ab: number;
    batting_r: number;
    batting_h: number;
    batting_2b: number;
    batting_3b: number;
    batting_hr: number;
    batting_rbi: number;
    batting_bb: number;
    batting_so: number;
    batting_sb: number;
    batting_avg: number;
    batting_obp: number;
    batting_slg: number;
    batting_ops: number;
    pitching_w: number;
    pitching_l: number;
    pitching_era: number;
    pitching_sv: number;
    pitching_ip: number;
    pitching_h: number;
    pitching_er: number;
    pitching_hr: number;
    pitching_bb: number;
    pitching_k: number;
    fielding_e: number;
    fielding_fp: number;
}
export interface MLBStandings {
    team: MLBTeam;
    league_name: string;
    league_short_name: string;
    division_name: string;
    division_short_name: string;
    wins: number;
    losses: number;
    win_percent: number;
    games_behind: number;
    streak: number;
    last_ten_games: string;
    season: number;
}
export interface MLBSeasonStats {
    player: MLBPlayer;
    team_name: string;
    season: number;
    postseason: boolean;
    batting_gp: number;
    batting_ab: number;
    batting_r: number;
    batting_h: number;
    batting_avg: number;
    batting_2b: number;
    batting_3b: number;
    batting_hr: number;
    batting_rbi: number;
    batting_bb: number;
    batting_so: number;
    batting_sb: number;
    batting_obp: number;
    batting_slg: number;
    batting_ops: number;
    batting_war: number;
    pitching_gp: number;
    pitching_gs: number;
    pitching_w: number;
    pitching_l: number;
    pitching_era: number;
    pitching_sv: number;
    pitching_ip: number;
    pitching_h: number;
    pitching_er: number;
    pitching_hr: number;
    pitching_bb: number;
    pitching_k: number;
    pitching_war: number;
}
export interface MLBTeamSeasonStats {
    team: MLBTeam;
    team_name: string;
    postseason: boolean;
    season: number;
    gp: number;
    batting_ab: number;
    batting_r: number;
    batting_h: number;
    batting_2b: number;
    batting_3b: number;
    batting_hr: number;
    batting_rbi: number;
    batting_bb: number;
    batting_so: number;
    batting_sb: number;
    batting_avg: number;
    batting_obp: number;
    batting_slg: number;
    batting_ops: number;
    pitching_w: number;
    pitching_l: number;
    pitching_era: number;
    pitching_sv: number;
    pitching_ip: number;
    pitching_h: number;
    pitching_er: number;
    pitching_hr: number;
    pitching_bb: number;
    pitching_k: number;
    fielding_e: number;
    fielding_fp: number;
}
export interface MLBPlayerInjury {
    player: MLBPlayer;
    date: string;
    return_date: string;
    type: string;
    detail: string;
    side: string;
    status: string;
    long_comment: string;
    short_comment: string;
}
export interface ClientConfig {
    apiKey: string;
    baseUrl?: string;
}
export declare class BaseClient {
    protected readonly baseUrl: string;
    protected readonly headers: Record<string, string>;
    constructor(config: ClientConfig);
    protected request<T>(path: string, options?: RequestInit): Promise<T>;
    protected buildQueryParams(params?: Record<string, any>): Record<string, string>;
}
