(() => {
  'use strict';
  const tiers = [
    { ceiling:200, bonus:10, label:'0 < 金额 ≤ 200' },
    { ceiling:700, bonus:20, label:'200 < 金额 ≤ 700' },
    { ceiling:1000, bonus:30, label:'700 < 金额 ≤ 1,000' },
    { ceiling:2000, bonus:50, label:'1,000 < 金额 ≤ 2,000' },
    { ceiling:5000, bonus:80, label:'2,000 < 金额 ≤ 5,000' },
    { ceiling:Infinity, bonus:120, label:'金额 > 5,000' }
  ];
  const visit = 10;
  function award(amount) {
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError('消费金额无效');
    const bonus = amount === 0 ? 0 : tiers.find(t => amount <= t.ceiling).bonus;
    return { visit, bonus, points:visit + bonus };
  }
  function ledger(state) {
    const game = state.game || {};
    const personal = game.pointRule === 2;
    return state.members.map((member, index) => {
      const initial = personal ? (game.handScore || 0) + (game.poses || []).reduce((n, p) => n + (p.memberScores?.[index] ?? p.score ?? 0), 0) : 0;
      const photo = personal && game.photoBonus === 10 ? 10 : 0;
      let visits = 0, spending = 0;
      for (const scan of state.scans) {
        const record = scan.entries?.[index];
        if (!record) continue;
        visits += record.visit;
        spending += record.bonus;
      }
      return { name:member.name, initial, photo, visits, spending, total:initial + photo + visits + spending };
    });
  }
  const rewards = [
    {cost:30, name:'角色贴纸', detail:'从八款 IP 中挑一张，贴进自己的漫游折页。'},
    {cost:80, name:'限定明信片', detail:'一套两张，同行者可以各留一张。'},
    {cost:150, name:'装订纪念册', detail:'免印一册，含合照、店铺印章和签名，拟定零售价 25 元。'},
    {cost:240, name:'双人纪念礼盒', detail:'两枚角色徽章和一套明信片，装进一份双人纪念盒。'},
    {cost:1000, name:'双人专场导览', detail:'按展方档期限量预约，由专人为两位访客带看整场限定展。'}
  ];
  window.MallPoints = { tiers, visit, award, ledger, rewards };
})();
