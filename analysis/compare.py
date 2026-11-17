import json, math, statistics
b=json.load(open('/home/hatch/workspace/makefun/token-radar-01/out/board.json'))
rows=b['rows']
INTER, SLOPE, C = -1.250, -0.528, 17.121
def ratio(tvl): return max(0.005, min(3.0, math.exp(INTER+SLOPE*(math.log(tvl)-C))))
for r in rows:
    r['implied3']=max(1, round(r['tvl_usd']*ratio(r['tvl_usd'])))
new=sorted(rows, key=lambda r: -r['implied3'])
for i,r in enumerate(new): r['rank3']=i+1
# spearman
n=len(rows)
d=[r['rank']-r['rank3'] for r in rows]
spear=1-6*sum(x*x for x in d)/(n*(n*n-1))
print('n rows:', n, 'Spearman rank corr radar2 vs radar3: %.3f'%spear)
print('top 10 radar-2:', [(r['rank'],r['name'],round(r['implied_value_usd']/1e6)) for r in rows[:10]])
print('top 10 radar-3:', [(r['rank3'],r['name'],round(r['implied3']/1e6)) for r in new[:10]])
print('biggest rank movers:')
for r in sorted(rows, key=lambda r: -abs(r['rank']-r['rank3']))[:8]:
    print(f"  {r['name']}: #{r['rank']} -> #{r['rank3']} (implied ${r['implied_value_usd']/1e6:.1f}M -> ${r['implied3']/1e6:.1f}M, TVL ${r['tvl_usd']/1e6:.0f}M)")
# farm economics distribution
GAS={'Ethereum':2.50,'Arbitrum':0.15,'Optimism':0.10,'Base':0.05,'BSC':0.15,'Binance':0.15,'Polygon':0.05,'Avalanche':0.30,'Solana':0.02,'zkSync Era':0.10,'Linea':0.10,'Scroll':0.10,'Blast':0.05,'Mantle':0.05,'Sonic':0.05,'Berachain':0.10,'Gnosis':0.05,'xDai':0.05,'Fantom':0.05,'Celo':0.05,'Mode':0.05,'Fraxtal':0.05,'Unichain':0.05,'Plasma':0.10,'Monad':0.05,'MegaETH':0.05,'Soneium':0.05,'Hyperliquid':0.10,'Sei':0.05,'Aptos':0.02,'Sui':0.02,'TON':0.05,'Tron':0.10}
def hold(age):
    if age is None: return 30
    if age<180: return 60
    if age<365: return 45
    return 30
bes=[]
for r in new:
    age=r['age_days']
    h=hold(age); weeks=math.ceil(h/7); txs=2+weeks+1
    chain=r['chains'][0] if r['chains'] else None
    g=GAS.get(chain,0.50)
    gas=txs*g
    be=gas/r['implied3']
    bes.append((be,gas,r['name'],r['rank3']))
bes.sort()
print('break-even share distribution (gas/implied):')
for q in (0,0.25,0.5,0.75,0.9,0.99,1.0):
    i=min(len(bes)-1,int(q*(len(bes)-1)))
    print(f"  p{int(q*100)}: {bes[i][0]*100:.4f}%  (${bes[i][1]:.2f} gas, {bes[i][2]}, rank {bes[i][3]})")
print('median gas total: $%.2f'%statistics.median([x[1] for x in bes]))
print('worst break-even:', [(f"{x[0]*100:.3f}%",x[2],f"rank {x[3]}") for x in bes[-5:]])
# verdict thresholds: FARM <0.01%, THIN <0.05%, SKIP above?
for t in (0.0001,0.0005,0.001):
    print(f"threshold {t*100:.3f}%: farm={sum(1 for x in bes if x[0]<t)} thin/skip={sum(1 for x in bes if x[0]>=t)}")
print('chains on board:', sorted(set(r['chains'][0] for r in rows if r['chains']))[:40])
print('rows with chain not in GAS table:', sum(1 for r in rows if r['chains'] and r['chains'][0] not in GAS))
