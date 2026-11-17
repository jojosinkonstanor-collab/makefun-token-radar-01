import json, math, statistics
from datetime import date
s=json.load(open('/home/hatch/workspace/makefun/kit-token-radar-01/token-radar-01-kit/input/snapshot.json'))
ps=s['protocols']; asof=date.fromisoformat(s['as_of'])
live=[p for p in ps if p['mcap_usd'] and p['mcap_usd']>0 and p['tvl_usd']>0 and p['category']!='CEX']
def age(p):
    return max(0,(asof-date.fromisoformat(p['listed_at'])).days) if p['listed_at'] else None
for p in live:
    p['_y']=math.log(p['mcap_usd']/p['tvl_usd']); p['_lt']=math.log(p['tvl_usd'])
    p['_age']=age(p); p['_g']=p['change_7d'] if p['change_7d'] is not None else 0.0
    p['_nch']=len(p['chains'])
def ols(X,y):
    k=len(X[0]); n=len(X)
    A=[[sum(X[r][i]*X[r][j] for r in range(n)) for j in range(k)]+[sum(X[r][i]*y[r] for r in range(n))] for i in range(k)]
    for i in range(k): A[i][i]+=1e-8
    for i in range(k):
        piv=max(range(i,k),key=lambda r:abs(A[r][i])); A[i],A[piv]=A[piv],A[i]
        d=A[i][i]; A[i]=[v/d for v in A[i]]
        for r in range(k):
            if r!=i and A[r][i]!=0:
                f=A[r][i]; A[r]=[a-f*b for a,b in zip(A[r],A[i])]
    return [A[i][k] for i in range(k)]
def pred(b,x): return sum(a*v for a,v in zip(b,x))
LT0=statistics.median([p['_lt'] for p in live])
print('median log TVL (live) =', round(LT0,3), '-> TVL $', round(math.exp(LT0)/1e6,1),'M')
print('live TVL range $', min(p['tvl_usd'] for p in live)/1e6, 'M ..', max(p['tvl_usd'] for p in live)/1e9,'B')
pre=[p for p in ps if p['mcap_usd'] is None and p['gecko_id'] is None and p['symbol'] is None]
print('pre-token TVL range $', min(p['tvl_usd'] for p in pre)/1e6,'M ..', max(p['tvl_usd'] for p in pre)/1e9,'B')
# extreme ratios
rs=sorted(live, key=lambda p: p['_y'])
print('lowest ratios:', [(p['name'], round(math.exp(p['_y']),3)) for p in rs[:5]])
print('highest ratios:', [(p['name'], round(math.exp(p['_y']),2)) for p in rs[-5:]])
# TVL-bin empirical medians vs curve
X=[[1.0,p['_lt']-LT0] for p in live]; y=[p['_y'] for p in live]
b=ols(X,y); print('size curve: intercept %.3f slope %.3f'%(b[0],b[1]))
import collections
bins=collections.defaultdict(list)
for p in live:
    bins[min(4,int((p['_lt']-math.log(5e6))/math.log(10)))].append(p['_y'])
for k in sorted(bins):
    lo=5e6*(10**k); hi=lo*10
    curve=math.exp(b[0]+b[1]*(math.log(math.sqrt(lo*hi))-LT0))
    print(f"TVL bin ${lo/1e6:.0f}M-${hi/1e6:.0f}M n={len(bins[k])} median ratio={math.exp(statistics.median(bins[k])):.3f} curve={curve:.3f}")
# shrunk category intercept: intercept_c = (n_c*mean_c + k*global)/(n_c+k) on residuals from size curve
res=[p['_y']-pred(b,[1.0,p['_lt']-LT0]) for p in live]
gmean=statistics.mean(res)
def loo_shrunk(k):
    errs=[]
    for i,p in enumerate(live):
        tr=[(q,r) for j,(q,r) in enumerate(zip(live,res)) if j!=i]
        # refit size curve on tr
        bb=ols([[1.0,q['_lt']-LT0] for q,_ in tr],[q['_y'] for q,_ in tr])
        rr=[q['_y']-pred(bb,[1.0,q['_lt']-LT0]) for q,_ in tr]
        gm=statistics.mean(rr)
        same=[r for q,r in tr if q['category']==p['category']]
        inter=(sum(same)+k*gm)/(len(same)+k) if same else gm
        errs.append(p['_y']-(pred(bb,[1.0,p['_lt']-LT0])+inter))
    return statistics.median([abs(e) for e in errs]), math.sqrt(sum(e*e for e in errs)/len(errs))
for k in (2,5,10,20):
    print(f"size+shrunk-cat k={k}: LOO med|e|={loo_shrunk(k)[0]:.3f} rmse={loo_shrunk(k)[1]:.3f}")
# winsorized growth variants on top of size
def loo_spec(f):
    errs=[]
    for i,p in enumerate(live):
        tr=[q for j,q in enumerate(live) if j!=i]
        bb=ols([f(q) for q in tr],[q['_y'] for q in tr])
        errs.append(p['_y']-pred(bb,f(p)))
    return statistics.median([abs(e) for e in errs]), math.sqrt(sum(e*e for e in errs)/len(errs))
print('size only:', loo_spec(lambda p:[1.0,p['_lt']-LT0]))
print('size+growth win +-30:', loo_spec(lambda p:[1.0,p['_lt']-LT0,max(-0.3,min(0.3,p['_g']/100))]))
print('size+growth win +-15:', loo_spec(lambda p:[1.0,p['_lt']-LT0,max(-0.15,min(0.15,p['_g']/100))]))
print('size+log age:', loo_spec(lambda p:[1.0,p['_lt']-LT0,math.log1p(p['_age'] if p['_age'] is not None else 365)/math.log(1096)]))
print('size+chains:', loo_spec(lambda p:[1.0,p['_lt']-LT0,min(p['_nch']-1,3)/3]))

print('--- robustness of the size curve ---')
def ols_xy(xs, ys):
    return ols([[1.0,x] for x in xs], ys)
xs=[p['_lt']-LT0 for p in live]; ys=[p['_y'] for p in live]
print('OLS all:', [round(v,3) for v in ols_xy(xs,ys)])
for lo,hi in [(-3.5,1.5),(-4,2),(-3,1)]:
    y2=[max(lo,min(hi,v)) for v in ys]
    print(f'OLS winsor y[{lo},{hi}]:', [round(v,3) for v in ols_xy(xs,y2)])
# drop Rain-like extremes |y|>3
keep=[(x,y) for x,y in zip(xs,ys) if abs(y)<=3]
print('OLS |y|<=3 n=%d:'%len(keep), [round(v,3) for v in ols_xy([a for a,_ in keep],[b for _,b in keep])])
# Theil-Sen
import itertools
sl=[]
for (x1,y1),(x2,y2) in itertools.combinations(zip(xs,ys),2):
    if abs(x2-x1)>0.5: sl.append((y2-y1)/(x2-x1))
ts=statistics.median(sl)
inter=statistics.median([y-ts*x for x,y in zip(xs,ys)])
print('Theil-Sen slope %.3f intercept %.3f'%(ts,inter))
# LOO for winsorized fit
def loo_winsor(lo,hi):
    errs=[]
    for i,p in enumerate(live):
        tr=[q for j,q in enumerate(live) if j!=i]
        yy=[max(lo,min(hi,q['_y'])) for q in tr]
        bb=ols([[1.0,q['_lt']-LT0] for q in tr], yy)
        errs.append(p['_y']-pred(bb,[1.0,p['_lt']-LT0]))
    return statistics.median([abs(e) for e in errs]), math.sqrt(sum(e*e for e in errs)/len(errs))
print('LOO winsor [-3.5,1.5]:', tuple(round(v,3) for v in loo_winsor(-3.5,1.5)))
print('LOO winsor [-4,2]:', tuple(round(v,3) for v in loo_winsor(-4,2)))
# fitted ratio range over board TVLs
for tvl in (5e6, 27.3e6, 50e6, 500e6, 5e9, 13.8e9):
    print(f"TVL ${tvl/1e6:.0f}M -> ratio {math.exp(b[0]+b[1]*(math.log(tvl)-LT0)):.3f}")
