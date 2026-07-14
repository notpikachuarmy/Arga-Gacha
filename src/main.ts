import Phaser from 'phaser';
import './style.css';
import charactersJson from './data/characters.json';
import enemiesJson from './data/enemies.json';
import bannersJson from './data/banners.json';
import worldsJson from './data/worlds.json';
import classesJson from './data/classes.json';
import type { CharacterData, EnemyData, BannerData, WorldData, ClassId } from './data/types';

const characters = charactersJson as CharacterData[];
const enemies = enemiesJson as EnemyData[];
const banners = bannersJson as BannerData[];
const worlds = worldsJson as WorldData[];
const classes = classesJson as {id:ClassId;name:string;strongAgainst:ClassId|null;icon:string}[];
const classMap = new Map(classes.map(c => [c.id, c]));

interface SaveData { tickets:number; fragments:number; owned:Record<string,number>; team:string[]; }
const SAVE_KEY='argagacha-save-v1';
const defaultSave:SaveData={tickets:12,fragments:0,owned:{caballero_mariposa:1,detective_lince:1,capitan_blaze:1},team:['caballero_mariposa','detective_lince','capitan_blaze']};
function loadSave():SaveData { try { return {...defaultSave,...JSON.parse(localStorage.getItem(SAVE_KEY)||'{}')}; } catch { return structuredClone(defaultSave); } }
function saveGame(s:SaveData){ localStorage.setItem(SAVE_KEY,JSON.stringify(s)); }
const path=(p:string)=>`${import.meta.env.BASE_URL}${p}`;

class MainScene extends Phaser.Scene {
  save=loadSave(); screen:'home'|'collection'|'gacha'|'battle'='home'; selected=0;
  constructor(){ super('main'); }
  preload(){
    this.load.image('logo',path('assets/ui/logo.png')); this.load.image('ticket',path('assets/ui/ticketgacha.png')); this.load.image('fragment',path('assets/ui/fragmentos.png'));
    worlds.forEach(w=>{this.load.image(`bg-${w.id}`,path(w.background));this.load.image(`banner-${w.id}`,path(w.bannerImage));});
    classes.forEach(c=>this.load.image(`class-${c.id}`,path(c.icon)));
    characters.forEach(c=>{this.load.image(`portrait-${c.id}`,path(c.portrait));this.load.image(`char-${c.id}`,path(c.sprite));});
    enemies.forEach(e=>this.load.image(`enemy-${e.id}`,path(e.sprite)));
  }
  create(){ this.renderHome(); }
  clear(){ this.children.removeAll(); }
  text(x:number,y:number,t:string,size=26,origin=.5){ return this.add.text(x,y,t,{fontFamily:'Arial',fontSize:`${size}px`,color:'#fff',stroke:'#000',strokeThickness:5,align:'center',wordWrap:{width:1000}}).setOrigin(origin); }
  button(x:number,y:number,w:number,h:number,label:string,fn:()=>void){
    const r=this.add.rectangle(x,y,w,h,0x18233b,.95).setStrokeStyle(3,0xf3c969).setInteractive({useHandCursor:true});
    const t=this.text(x,y,label,25); r.on('pointerover',()=>r.setFillStyle(0x29385d)); r.on('pointerout',()=>r.setFillStyle(0x18233b)); r.on('pointerdown',fn); return [r,t];
  }
  header(){
    this.add.rectangle(640,40,1280,80,0x090d18,.9);
    this.add.image(30,40,'ticket').setDisplaySize(40,40).setOrigin(0,.5); this.text(78,40,String(this.save.tickets),24,0);
    this.add.image(190,40,'fragment').setDisplaySize(40,40).setOrigin(0,.5); this.text(238,40,String(this.save.fragments),24,0);
    this.text(1245,40,'ARGAGACHA',20,1);
  }
  renderHome(){ this.screen='home';this.clear();this.add.image(640,360,'bg-hoennia').setDisplaySize(1280,720).setTint(0x778899);this.add.rectangle(640,360,1280,720,0x050913,.44);this.header();this.add.image(640,160,'logo').setDisplaySize(285,180);this.text(640,280,'Mundos distintos. Banners distintos. Una sola colección.',24);
    this.button(640,370,330,65,'COLECCIÓN',()=>this.renderCollection());this.button(640,455,330,65,'GACHA DE HOENNIA',()=>this.renderGacha());this.button(640,540,330,65,'EXPEDICIÓN',()=>this.startBattle());
  }
  back(){ this.button(90,670,140,48,'VOLVER',()=>this.renderHome()); }
  renderCollection(){ this.screen='collection';this.clear();this.add.rectangle(640,360,1280,720,0x0d1424);this.header();this.text(640,95,'COLECCIÓN DE HOENNIA',34);
    const owned=characters.filter(c=>(this.save.owned[c.id]||0)>0); if(!owned.length){this.text(640,350,'Todavía no tienes personajes.',28);} owned.forEach((c,i)=>{const col=i%5,row=Math.floor(i/5),x=170+col*235,y=215+row*210;const card=this.add.rectangle(x,y,190,180,0x172038).setStrokeStyle(2,c.rarity===5?0xffd866:0x8798b8).setInteractive({useHandCursor:true});this.add.image(x,y-28,`portrait-${c.id}`).setDisplaySize(150,120);this.add.rectangle(x,y+55,190,70,0x080c15,.9);this.add.image(x-72,y+42,`class-${c.classId}`).setDisplaySize(28,28);this.text(x,y+33,c.name,17);this.text(x,y+60,`${'★'.repeat(c.rarity)} · Copias ${this.save.owned[c.id]}`,15);card.on('pointerdown',()=>this.showCharacter(c));});this.back(); }
  showCharacter(c:CharacterData){ this.clear();this.add.rectangle(640,360,1280,720,0x0d1424);this.header();this.add.image(355,380,`portrait-${c.id}`).setDisplaySize(540,540);this.add.rectangle(860,380,650,520,0x121b30,.95).setStrokeStyle(2,0xf3c969);this.add.image(595,175,`class-${c.classId}`).setDisplaySize(54,54);this.text(860,145,c.name,38);this.text(860,190,`${classMap.get(c.classId)?.name} · ${'★'.repeat(c.rarity)}${c.provisionalClass?' · CLASE PROVISIONAL':''}`,20);this.add.text(590,235,c.lore,{fontFamily:'Arial',fontSize:'22px',color:'#e8edf7',wordWrap:{width:555},lineSpacing:7});this.text(860,515,`PV ${c.stats.hp}   ATQ ${c.stats.attack}   DEF ${c.stats.defense}   VEL ${c.stats.speed}`,21);this.button(860,590,270,52,this.save.team.includes(c.id)?'EN EL EQUIPO':'AÑADIR AL EQUIPO',()=>{ if(!this.save.team.includes(c.id)){ if(this.save.team.length>=3)this.save.team.shift();this.save.team.push(c.id);saveGame(this.save);} this.showCharacter(c);});this.button(90,670,140,48,'VOLVER',()=>this.renderCollection()); }
  renderGacha(message=''){ this.screen='gacha';this.clear();this.add.image(640,360,'banner-hoennia').setDisplaySize(1280,720);this.add.rectangle(640,360,1280,720,0x050913,.32);this.header();this.add.rectangle(640,390,1050,520,0x080c15,.48).setStrokeStyle(3,0xf3c969);this.text(640,125,'ECOS DE HOENNIA',42);this.text(640,170,'Cada mundo tendrá su propio banner y reparto.',22);if(message)this.text(640,510,message,25);this.button(500,590,250,60,'1 TIRADA · 1 🎟',()=>this.pull(1));this.button(780,590,250,60,'10 TIRADAS · 10 🎟',()=>this.pull(10));this.back(); }
  pull(count:number){ if(this.save.tickets<count){this.renderGacha('No tienes suficientes tickets.');return;}this.save.tickets-=count;const banner=banners[0];const results:string[]=[];for(let i=0;i<count;i++){const r=Math.random();let rarity=2,acc=0;for(const value of [5,4,3,2]){acc+=banner.rates[String(value)];if(r<=acc){rarity=value;break;}}const pool=characters.filter(c=>c.rarity===rarity);const c=Phaser.Utils.Array.GetRandom(pool.length?pool:characters);const duplicate=(this.save.owned[c.id]||0)>0;this.save.owned[c.id]=(this.save.owned[c.id]||0)+1;if(duplicate)this.save.fragments+=c.rarity*10;results.push(`${c.name} ${'★'.repeat(c.rarity)}${duplicate?' · +'+c.rarity*10+' fragmentos':''}`);}saveGame(this.save);this.renderGacha(results.join('\n')); }
  startBattle(){ const team=this.save.team.map(id=>characters.find(c=>c.id===id)).filter(Boolean) as CharacterData[];if(!team.length){this.renderHome();return;}this.screen='battle';this.clear();this.add.image(640,360,'bg-hoennia').setDisplaySize(1280,720);this.add.rectangle(640,360,1280,720,0x050913,.18);this.header();const foes=enemies.filter(e=>!e.boss).sort(()=>Math.random()-.5).slice(0,3);const allies=team.map(c=>({data:c,hp:c.stats.hp,sprite:null as Phaser.GameObjects.Image|null,x:0,y:0}));const bads=foes.map(e=>({data:e,hp:e.stats.hp,sprite:null as Phaser.GameObjects.Image|null,x:0,y:0}));allies.forEach((u,i)=>{u.x=240;u.y=220+i*150;u.sprite=this.add.image(u.x,u.y,`char-${u.data.id}`).setDisplaySize(155,155);});bads.forEach((u,i)=>{u.x=1040;u.y=220+i*150;u.sprite=this.add.image(u.x,u.y,`enemy-${u.data.id}`).setDisplaySize(u.data.boss?210:155, u.data.boss?210:155).setFlipX(true);});this.text(640,105,'EXPEDICIÓN EN HOENNIA',30);const log=this.add.text(430,570,'El combate comenzará...',{fontFamily:'Arial',fontSize:'19px',color:'#fff',backgroundColor:'#000a',padding:{x:15,y:10},wordWrap:{width:420}});this.button(640,665,260,48,'COMENZAR COMBATE',async()=>{const btn=this.children.getByName('none');let turn=0;while(allies.some(a=>a.hp>0)&&bads.some(b=>b.hp>0)&&turn<60){turn++;for(const a of allies.filter(x=>x.hp>0)){const target=bads.find(x=>x.hp>0)!;await this.attack(a,target,log);}for(const b of bads.filter(x=>x.hp>0)){const target=allies.find(x=>x.hp>0)!;await this.attack(b,target,log);} }const won=allies.some(a=>a.hp>0);if(won){const reward=2;this.save.tickets+=reward;this.save.fragments+=15;saveGame(this.save);log.setText('¡Victoria! Recompensa: 2 tickets y 15 fragmentos.');}else log.setText('Derrota. Puedes reorganizar el equipo e intentarlo de nuevo.');this.button(640,665,260,48,'VOLVER AL MENÚ',()=>this.renderHome());}); }
  async attack(attacker:any,target:any,log:Phaser.GameObjects.Text){ if(!attacker.sprite||!target.sprite)return;const clsA=attacker.data.classId as ClassId,clsT=target.data.classId as ClassId;const advantage=classMap.get(clsA)?.strongAgainst===clsT?1.25:classMap.get(clsT)?.strongAgainst===clsA?0.8:1;const damage=Math.max(5,Math.round((attacker.data.stats.attack-target.data.stats.defense*.35)*advantage*(.9+Math.random()*.2)));log.setText(`${attacker.data.name} ataca a ${target.data.name}: ${damage} de daño${advantage>1?' (ventaja)':''}.`);await new Promise<void>(resolve=>this.tweens.add({targets:attacker.sprite,x:attacker.x+(target.x>attacker.x?28:-28),duration:90,yoyo:true,onComplete:()=>resolve()}));target.hp-=damage;this.tweens.add({targets:target.sprite,alpha:.25,duration:65,yoyo:true,repeat:1});if(target.hp<=0)this.tweens.add({targets:target.sprite,alpha:0,duration:220,onComplete:()=>target.sprite.setVisible(false)});await new Promise(r=>this.time.delayedCall(180,r)); }
}

new Phaser.Game({type:Phaser.AUTO,parent:'game',width:1280,height:720,backgroundColor:'#090d18',scene:[MainScene],scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}});
