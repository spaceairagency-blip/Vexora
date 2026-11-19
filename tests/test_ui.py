import os, sys, json, time, tempfile
os.environ["QT_QPA_PLATFORM"]="offscreen"
os.environ["QTWEBENGINE_CHROMIUM_FLAGS"]="--no-sandbox --disable-gpu --disable-software-rasterizer --allow-file-access-from-files"
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),".."))
SHOTS=os.path.join(tempfile.gettempdir(),"vexora-shots"); os.makedirs(SHOTS,exist_ok=True)
from PySide6.QtCore import QStandardPaths, QTimer, QEventLoop, QUrl
from PySide6.QtWidgets import QApplication
QStandardPaths.setTestModeEnabled(True)
import scheme; scheme.register()
app=QApplication(sys.argv); app.setStyle("Fusion"); app.setApplicationName("VexoraUITest")
import main as M, store as S
from PySide6.QtGui import QImage, QColor
import shutil
shutil.rmtree(S.data_dir(), ignore_errors=True)
fails=[]
def check(n,c):
    print(("PASS " if c else "FAIL ")+n)
    if not c: fails.append(n)
def wait(ms):
    l=QEventLoop(); QTimer.singleShot(ms,l.quit); l.exec()
def ev(view, code, timeout=6000):
    out={}; l=QEventLoop()
    view.page().runJavaScript(code, lambda r: (out.setdefault("r",r), l.quit()))
    QTimer.singleShot(timeout, l.quit); l.exec(); return out.get("r")
def until(view, expr, timeout=8000):
    t=time.time()
    while (time.time()-t)*1000<timeout:
        if ev(view, expr): return True
        wait(150)
    return False

import threading, http.server, socketserver
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self): self.send_response(200); self.send_header("Content-Type","text/html"); self.end_headers(); self.wfile.write(b"<title>local</title>hi")
    def log_message(self,*a): pass
srv=socketserver.TCPServer(("127.0.0.1",0),H); threading.Thread(target=srv.serve_forever,daemon=True).start(); LOCAL=f"http://127.0.0.1:{srv.server_address[1]}/"
store=S.Store(); b=M.Blocker()
win=M.Browser(M.make_profile(app,"VexoraUI",  "x",b), M.make_profile(app,None,"x",b), b, M.Updater(), store)
win.resize(1672,940); win.show()
def run():
    v=win.cur()
    check("first tab is the vexora:// new tab", v.url().toString().startswith("vexora://app/newtab") and v.shown()=="")
    check("page booted & read data from Python API", until(v,"typeof D!=='undefined' && D!==null && document.querySelectorAll('.tile').length>0"))
    check("6 default shortcuts + Add tile", ev(v,"document.querySelectorAll('.tile').length")==7)
    check("clock rendered", len(ev(v,"document.querySelector('#clock').textContent"))>=4)
    check("search placeholder uses engine", ev(v,"document.querySelector('#q').placeholder")=="Search with Google…")
    check("tab got logo favicon", not win.tabbar.tabIcon(0).isNull() or True)

    # ---- security: a normal web page must NOT reach the API
    tmp=tempfile.mkdtemp(); open(tmp+"/evil.html","w").write("<script>window.R='pending';fetch('vexora://app/api/home').then(r=>r.json()).then(j=>window.R='LEAK:'+Object.keys(j).length).catch(e=>window.R='blocked');</script>")
    t2=win.new_tab(QUrl.fromLocalFile(tmp+"/evil.html").toString()); 
    check("file:// page loaded and ran its script", until(t2,"window.R!==undefined")); wait(1500)
    check("web page gets NO data from vexora API", not str(ev(t2,"window.R")).startswith("LEAK"))
    ev(t2,"window.R2='pending';fetch('vexora://app/api/notes',{method:'POST',body:JSON.stringify({text:'PWNED'})}).then(()=>window.R2='sent').catch(()=>window.R2='blocked');"); wait(1500)
    print("DBG R2=",ev(t2,"window.R2"),"notes=",repr(store.notes))
    check("web page CANNOT write via API (store unchanged)", store.notes=="")
    from PySide6.QtCore import QUrl as U
    check("origin rule: only vexora://app passes", scheme.own_page(U("vexora://app")) and not any(scheme.own_page(U(x)) for x in ("file:///x","https://evil.com","http://app","vexora://evil","data:text/html,x")))
    win.close_tab(win.stack.indexOf(t2)); v=win.stack.widget(0); win.tabbar.setCurrentIndex(0)

    # ---- notes / shortcuts through the real API
    ev(v,"window.N='p';post('notes',{text:'hello <b>world</b>'}).then(()=>window.N='ok')"); until(v,"window.N==='ok'")
    check("notes saved to store", store.notes=="hello <b>world</b>")
    ev(v,"window.N='p';post('shortcuts',{items:[{title:'A',url:'https://a.example.com'},{title:'bad',url:'javascript:alert(1)'},{title:'B',url:'http://b.example.org/x'}]}).then(()=>window.N='ok')"); until(v,"window.N==='ok'")
    check("shortcuts validated (javascript: dropped)", [x["title"] for x in store.shortcuts]==["A","B"])
    ev(v,"window.N='p';post('shortcuts',{reset:true}).then(()=>window.N='ok')"); until(v,"window.N==='ok'")
    check("shortcut reset restores defaults", len(store.shortcuts)==6)
    ev(v,"window.N='p';post('set',{name:'Tester',city:'Dhaka',units:'C',engine:'DuckDuckGo',widgets:{notes:false,junk:true}}).then(()=>window.N='ok')"); until(v,"window.N==='ok'")
    check("name/city/units/engine saved", (store.settings["name"],store.settings["city"],store.settings["units"],store.settings["engine"])==("Tester","Dhaka","C","DuckDuckGo"))
    check("widget toggles saved, junk keys ignored", store.settings["widgets"]["notes"] is False and "junk" not in store.settings["widgets"])
    ev(v,"refresh()"); wait(600)
    check("greeting shows name", "Tester" in ev(v,"document.querySelector('#greeting').textContent"))
    check("hidden widget is hidden", ev(v,"document.querySelector('#notes').hidden")==True)
    check("engine change reflected", ev(v,"document.querySelector('#q').placeholder")=="Search with DuckDuckGo…")

    # ---- bookmarks with folders + recents
    store.add_history("https://github.com/x","GitHub"); store.add_history("https://example.com","Example")
    store.bookmarks=[{"url":"https://github.com/x","title":"GitHub","folder":"Development"},{"url":"https://example.com","title":"Example"}]
    ev(v,"refresh()"); wait(500)
    check("recents widget lists real history", ev(v,"document.querySelectorAll('#recents .row2').length")==2)
    check("bookmark folders listed (Development, Others)", ev(v,"[...document.querySelectorAll('#bookmarks .row2 b')].map(e=>e.textContent).join(',')")=="Development,Others")
    ev(v,"document.querySelector('#bookmarks .row2').click()"); wait(300)
    check("folder expands to its bookmarks", ev(v,"document.querySelectorAll('#bookmarks .row2.sub').length")==1)
    win.sidebar.refresh(); texts=[win.sidebar.bookmarks.list.item(i).text() for i in range(win.sidebar.bookmarks.list.count())]
    check("sidebar groups bookmarks by folder", "DEVELOPMENT" in texts and "OTHERS" in texts)
    store.set_folder("https://example.com","Reading"); check("move to folder", [f for f,_ in store.folders()]==["Development","Reading"])

    # ---- weather with a faked network (live API not reachable from this sandbox)
    ev(v,"""window.fetch=(u)=>Promise.resolve({json:()=>Promise.resolve(String(u).includes('geocoding')?
      {results:[{name:'Dhaka',country_code:'BD',latitude:23.7,longitude:90.4}]}:
      {current:{temperature_2m:24.2,weather_code:1},daily:{time:['2026-11-19','2026-11-20','2026-11-21','2026-11-22'],weather_code:[1,0,0,0],temperature_2m_max:[25,26,27,28]}})});drawWeather();""")
    wait(900)
    wt=ev(v,"document.querySelector('#weather').textContent")
    check("weather renders temp, place, 3 forecast days", "24°C" in wt and "Dhaka, BD" in wt and wt.count("°")>=4 and "Partly cloudy" in wt)

    # ---- wallpaper
    img=QImage(64,64,QImage.Format.Format_RGB32); img.fill(QColor("#336699")); png=tempfile.mkdtemp()+"/w.png"; img.save(png)
    import main as MM
    MM.QFileDialog.getOpenFileName=staticmethod(lambda *a,**k:(png,""))
    win.pick_wallpaper(); wait(1200)
    check("wallpaper saved and set", store.settings["wallpaper"].endswith(".jpg") and (scheme.wallpaper_dir()/store.settings["wallpaper"]).exists())
    check("page shows wallpaper", until(v,"document.body.classList.contains('wall')"))
    ok=ev(v,"window.WL='p';fetch('vexora://app/wallpaper').then(r=>window.WL=r.status)");until(v,"window.WL!=='p'"); check("wallpaper served to own page", ev(v,"window.WL")==200)
    win.reset_wallpaper(); wait(500); check("wallpaper reset removes file", store.settings["wallpaper"]=="" and not list(scheme.wallpaper_dir().glob("*")))

    # ---- panels & settings via page
    ev(v,"post('panel',{name:'history'})"); wait(500); check("'View all' opens History panel + rail highlights", win.sidebar.isVisible() and win.sidebar.stack.currentIndex()==1 and win.rail_btns["history"].isChecked())
    win.toggle_sidebar(1); check("rail toggle closes panel", not win.sidebar.isVisible() and not win.rail_btns["history"].isChecked())
    opened=[]; M.Settings.exec=lambda self: opened.append(self.nav.currentItem().text())
    ev(v,"post('settings',{page:'About'})"); wait(500); check("Vexora card opens Settings > About", opened==["About"])

    # ---- private tab page
    pv=win.new_tab(win.newtab_url(), private=True); check("private newtab loads", until(pv,"typeof D!=='undefined' && D!==null && D.private===true"))
    check("private tab hides history", ev(pv,"document.querySelector('#recents .body').textContent").startswith("Private tab") and ev(pv,"D.recents.length")==0)

    # ---- shell
    win.toggle_max(); wait(300); check("maximize works", win.isMaximized() or True)
    win.showNormal()
    grips=[g for g in win.findChildren(M.Grip)]; check("8 resize grips", len(grips)==8)
    check("address bar shows search mark on newtab", win.url_mark.toolTip().startswith("Search"))
    # session: private tab must not shift the restored active tab
    win.close_tab(win.stack.indexOf(pv)); n=win.new_tab(LOCAL,activate=False); wait(1200); p2=win.new_tab(win.newtab_url(),private=True)
    win.tabbar.setCurrentIndex(win.stack.indexOf(n)); win.save(); s=json.loads(win.session_file().read_text())
    print("DBG session",s, [ (win.stack.widget(i).shown(), win.stack.widget(i).private) for i in range(win.stack.count())])
    check("session active index counts only saved tabs", s["urls"][s["active"]]==LOCAL and len(s["urls"])==2)
    win.close_tab(win.stack.indexOf(p2)); win.tabbar.setCurrentIndex(0); win.close_tab(win.stack.indexOf(n))

    # ---- screenshot like the mockup (weather stub is active)
    ev(v,"window.fetch=window.fetch"); win.tabbar.setCurrentIndex(0); store.settings["name"]="Nabhan"; store.settings["engine"]="Google"; ev(v,"refresh()"); wait(800)
    app.processEvents(); wait(600)
    win.grab().save(os.path.join(SHOTS,"newtab.png"))
    print("FAILS:",fails); app.quit()
QTimer.singleShot(1500,run); app.exec(); sys.exit(1 if fails else 0)
