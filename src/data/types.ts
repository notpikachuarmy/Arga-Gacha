export type ClassId = 'vanguardia'|'duelista'|'tirador'|'arcanista'|'guardian'|'apoyo'|'irregular';
export interface Stats { hp:number; attack:number; defense:number; speed:number; }
export type ActiveTarget = 'single'|'allEnemies'|'lowestAlly'|'allAllies';
export interface ActiveSkill { name:string; description:string; target:ActiveTarget; power:number; }
export interface PassiveSkill { name:string; description:string; stat:'hp'|'attack'|'defense'|'speed'|'damage'|'healing'; value:number; }
export interface CharacterData { id:string; name:string; worldId:string; bannerId:string; classId:ClassId; rarity:number; lore:string; portrait:string; sprite:string; stats:Stats; activeSkill:ActiveSkill; passiveSkill:PassiveSkill; provisionalClass?:boolean; }
export interface EnemyData { id:string; name:string; worldId:string; classId:ClassId; boss:boolean; lore:string; sprite:string; stats:Stats; }
export interface WorldData { id:string; name:string; description:string; bannerImage:string; background:string; }
export interface BannerData { id:string; worldId:string; name:string; image:string; featuredCharacterIds:string[]; ticketCost:number; rates:Record<string,number>; }
