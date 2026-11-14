package socle.vscode

import scala.scalajs.js
import utest._
import SidebarModel._

// Plain Node: the side panel's pure model (payload parsing, run states, tree rows).
object SidebarModelTest extends TestSuite {
  private def json(s: String): js.Any = js.JSON.parse(s)

  private val testsPayload = json(
    """{"suites":[
      |  {"suite":"deephier.DeepSocSpec","file":"file:///ws/example/test/src/deephier/DeepSocSpec.scala",
      |   "tests":[{"name":"DeepSoc elaborates and steps","line":7},{"name":"Cluster with 3 cores steps","line":21}]},
      |  {"suite":"gcd.GcdSpec","file":"file:///ws/example/test/src/gcd/GcdSpec.scala",
      |   "tests":[{"name":"GCD computes gcd(48, 18)","line":8}]}
      |]}""".stripMargin)

  private val state = json(
    """{"type":"socle-state",
      | "design":{"top":"DeepSoc","modules":[
      |   {"name":"DeepSoc","scalaClass":"deephier.DeepSoc","kind":"internal","source":{"file":"/ws/DeepSoc.scala","line":162},
      |    "children":[{"name":"cluster0","type":"Cluster"},{"name":"pipe","type":"Queue4"}]},
      |   {"name":"Cluster","scalaClass":"deephier.Cluster","kind":"internal","source":{"file":"src/Cluster.scala","line":119},
      |    "children":[{"name":"core","type":"Core"}]},
      |   {"name":"Core","scalaClass":"","kind":"internal","source":null,"children":[]},
      |   {"name":"Queue4","scalaClass":"","kind":"internal","source":null,"children":[]}
      | ]},
      | "path":["DeepSoc","cluster0"],
      | "selection":"core",
      | "details":{"name":"core","module":"Core","scalaClass":"deephier.Core","kind":"internal",
      |   "params":[{"name":"width","type":"Int","value":"32"},{"name":"n","type":"","value":"4"}],
      |   "ports":[{"name":"clock","dir":"in","type":"Clock"},{"name":"io","dir":"out","type":"CoreIO"}]}
      |}""".stripMargin)

  val tests = Tests {
    test("parseTests") {
      test("the suites and tests, in order") {
        val s = parseTests(testsPayload)
        assert(s.map(_.suite) == Seq("deephier.DeepSocSpec", "gcd.GcdSpec"))
        assert(s(1) == SuiteInfo("gcd.GcdSpec", "file:///ws/example/test/src/gcd/GcdSpec.scala",
          Seq(TestInfo("GCD computes gcd(48, 18)", 8))))
      }
      test("malformed entries are skipped") {
        val s = parseTests(json("""{"suites":[{"suite":"a.A","file":"file:///a","tests":[{"name":"x","line":"1"},{"name":"y","line":2}]},
                                  |{"suite":3,"file":"f","tests":[]},"junk",{"suite":"b.B","file":"file:///b","tests":"no"}]}""".stripMargin))
        assert(s == Seq(SuiteInfo("a.A", "file:///a", Seq(TestInfo("y", 2)))))
      }
      test("nothing usable") {
        assert(parseTests(null) == Nil, parseTests(js.undefined) == Nil, parseTests(json("""{"suites":7}""")) == Nil)
      }
    }

    test("relativePath") {
      assert(relativePath("file:///ws/example/A.scala", Some("file:///ws")) == "example/A.scala")
      assert(relativePath("file:///ws/example/A.scala", Some("file:///ws/")) == "example/A.scala")
      assert(relativePath("file:///other/A.scala", Some("file:///ws")) == "/other/A.scala")
      assert(relativePath("file:///ws2/A.scala", Some("file:///ws")) == "/ws2/A.scala")
      assert(relativePath("file:///a%20b/A.scala", None) == "/a b/A.scala")
    }

    test("RunTracker") {
      val a = TestKey("gcd.GcdSpec", "t1")
      val b = TestKey("deephier.DeepSocSpec", "t2")
      test("a view: running, then shown") {
        val r = new RunTracker
        assert(r.state(a) == Idle)
        r.onStatus("running", a.suite, a.test)
        assert(r.state(a) == Running, r.state(b) == Idle)
        r.onStatus("ok", a.suite, a.test)
        assert(r.state(a) == Shown)
        r.onStatus("running", b.suite, b.test)
        assert(r.state(a) == Shown, r.state(b) == Running) // a stays shown until b's design lands
        r.onStatus("ok", b.suite, b.test)
        assert(r.state(a) == Idle, r.state(b) == Shown)
      }
      test("a failed view, then a good one") {
        val r = new RunTracker
        r.onStatus("ok", a.suite, a.test)
        r.onStatus("running", b.suite, b.test)
        r.onStatus("error", b.suite, b.test)
        assert(r.state(b) == Failed, r.state(a) == Shown) // the design of a is still the one shown
        r.onStatus("ok", b.suite, b.test)
        assert(r.state(b) == Shown, r.state(a) == Idle)
      }
      test("a simulation, then the status it restores") {
        val r = new RunTracker
        r.onStatus("ok", a.suite, a.test)
        r.onStatus("simulating", b.suite, b.test)
        assert(r.state(b) == Simulating, r.state(a) == Shown)
        r.onStatus("ok", a.suite, a.test)
        assert(r.state(b) == Idle, r.state(a) == Shown)
      }
      test("a view started from the Tests view is running at once") {
        val r = new RunTracker
        r.viewStarted(a)
        assert(r.state(a) == Running)
        r.onStatus("ok", a.suite, a.test)
        assert(r.state(a) == Shown)
      }
      test("a refused View design is not running") {
        val r = new RunTracker
        r.viewStarted(a)
        r.viewNotStarted(b) // another test: no change
        assert(r.state(a) == Running)
        r.viewNotStarted(a)
        assert(r.state(a) == Idle)
      }
      test("panel closed: nothing shown; reset: nothing at all") {
        val r = new RunTracker
        r.onStatus("ok", a.suite, a.test)
        r.onStatus("error", b.suite, b.test)
        r.panelClosed()
        assert(r.state(a) == Idle, r.state(b) == Failed)
        r.onStatus("running", a.suite, a.test)
        r.reset()
        assert(r.state(a) == Idle, r.state(b) == Idle)
      }
      test("an error without a suite marks nothing") {
        val r = new RunTracker
        r.onStatus("error", "", "t1")
        assert(r.state(TestKey("", "t1")) == Idle)
      }
    }

    test("testRow") {
      val t = TestInfo("GCD computes gcd(48, 18)", 8)
      def row(st: RunState) = testRow("gcd.GcdSpec", "file:///ws/G.scala", t, st)
      assert(row(Idle).label == t.name, row(Idle).description == "", row(Idle).icon == "beaker")
      assert(row(Idle).contextValue == "test", row(Idle).id == "test:file:///ws/G.scala#gcd.GcdSpec#GCD computes gcd(48, 18)")
      assert(row(Shown).description == "shown", row(Shown).icon == "eye")
      assert(row(Running).description == "running…", row(Running).icon == "sync~spin")
      assert(row(Simulating).description == "simulating…", row(Simulating).icon == "sync~spin")
      assert(row(Failed).icon == "error", row(Failed).description == "failed")
      val s = suiteRow(SuiteInfo("gcd.GcdSpec", "file:///ws/G.scala", Seq(t)), Some("file:///ws"))
      assert(s.label == "GcdSpec", s.description == "G.scala", s.contextValue == "suite", s.expandable)
      // the same FQCN in two files (two test modules): distinct suite and test ids
      val s2 = suiteRow(SuiteInfo("gcd.GcdSpec", "file:///ws/other/G.scala", Seq(t)), Some("file:///ws"))
      assert(s.id != s2.id)
      assert(testRow("gcd.GcdSpec", "file:///ws/other/G.scala", t, Idle).id != row(Idle).id)
    }

    test("testsMessage") {
      val one = Seq(SuiteInfo("a.A", "file:///a", Seq(TestInfo("x", 1))))
      assert(testsMessage(loaded = false, Nil, None) == None) // still loading
      assert(testsMessage(loaded = true, Nil, None) == Some("No ChiselSim tests in this workspace."))
      assert(testsMessage(loaded = true, one, None) == None)
      assert(testsMessage(loaded = true, one, Some("no java")) == Some("no java"))
      assert(serverProblem(1).exists(_.contains("not running")), serverProblem(2) == None, serverProblem(3) == None)
    }

    test("parseUiState") {
      test("a full state") {
        val u = parseUiState(state).get
        assert(u.path == List("DeepSoc", "cluster0"), u.selection == Some("core"))
        val d = u.design.get.get
        assert(d.top == "DeepSoc", d.modules("Cluster").source == Some(SourceInfo("src/Cluster.scala", 119)))
        assert(d.modules("Core").source == None)
        assert(d.modules("DeepSoc").children == Seq(("cluster0", "Cluster"), ("pipe", "Queue4")))
        val det = u.details.get
        assert(det.name == "core", det.module == "Core", det.scalaClass == "deephier.Core")
        assert(det.params == Seq(("width", "Int", "32"), ("n", "", "4")))
        assert(det.ports == Seq(("clock", "in", "Clock"), ("io", "out", "CoreIO")))
      }
      test("no design yet") {
        val u = parseUiState(json("""{"type":"socle-state","design":null,"path":[],"selection":null,"details":null}""")).get
        assert(u.design == Some(None), u.details == None, u.path == Nil)
      }
      test("no design key: the design is unchanged") {
        val u = parseUiState(json("""{"type":"socle-state","path":["A"],"selection":null,"details":null}""")).get
        assert(u.design == None, u.path == List("A"))
      }
      test("not a state") {
        assert(parseUiState(json("""{"type":"socle-theme","kind":"dark"}""")) == None)
        assert(parseUiState(json("""{"type":"socle-state","path":"x"}""")) == None)
        assert(parseUiState(json("""{"type":"socle-state","path":[1]}""")) == None)
        assert(parseUiState(json("""{"type":"socle-state","path":[],"selection":3}""")) == None)
        assert(parseUiState(json("""{"type":"socle-state","path":[],"design":{"top":1}}""")) == None)
        assert(parseUiState(null) == None, parseUiState("socle-state") == None)
      }
    }

    test("hierarchy") {
      val d = parseUiState(state).get.design.get.get
      test("roots and children") {
        assert(hierRoots(d) == Seq(List("DeepSoc")))
        assert(hierChildren(d, List("DeepSoc")) == Seq(List("DeepSoc", "cluster0"), List("DeepSoc", "pipe")))
        assert(hierChildren(d, List("DeepSoc", "cluster0")) == Seq(List("DeepSoc", "cluster0", "core")))
        assert(hierChildren(d, List("DeepSoc", "pipe")) == Nil)
        assert(hierChildren(d, List("DeepSoc", "nope")) == Nil)
      }
      test("rows") {
        val top = hierRow(d, List("DeepSoc")).get
        assert(top.label == "DeepSoc", top.description == "DeepSoc", top.id == "hier:DeepSoc", top.expandable)
        val c = hierRow(d, List("DeepSoc", "cluster0")).get
        assert(c.label == "cluster0", c.description == "Cluster", c.tooltip == "deephier.Cluster (module Cluster)")
        val leaf = hierRow(d, List("DeepSoc", "pipe")).get
        assert(leaf.description == "Queue4", !leaf.expandable)
        assert(hierRow(d, List("DeepSoc", "nope")) == None)
      }
      test("navigation: drill into a module, select a leaf in its parent") {
        assert(navigateTarget(d, List("DeepSoc", "cluster0")) == Some((List("DeepSoc", "cluster0"), None)))
        assert(navigateTarget(d, List("DeepSoc", "pipe")) == Some((List("DeepSoc"), Some("pipe"))))
        assert(navigateTarget(d, List("DeepSoc", "cluster0", "core")) == Some((List("DeepSoc", "cluster0"), Some("core"))))
        assert(navigateTarget(d, List("DeepSoc")) == Some((List("DeepSoc"), None)))
        assert(navigateTarget(d, List("DeepSoc", "nope")) == None)
      }
      test("module source") {
        assert(moduleSource(d, List("DeepSoc", "cluster0")) == Some(SourceInfo("src/Cluster.scala", 119)))
        assert(moduleSource(d, List("DeepSoc", "pipe")) == None)
      }
      test("the drill path is revealed only from the top") {
        assert(revealPath(d, List("DeepSoc", "cluster0")) == Some(List("DeepSoc", "cluster0")))
        assert(revealPath(d, List("Cluster")) == None) // a module jumped to from the palette
        assert(revealPath(d, Nil) == None)
        // a selected child instance (a leaf clicked in the Hierarchy) is revealed itself
        assert(revealPath(d, List("DeepSoc"), Some("pipe")) == Some(List("DeepSoc", "pipe")))
        assert(revealPath(d, List("DeepSoc"), Some("io.out")) == Some(List("DeepSoc"))) // a wire

      }
    }

    test("fold groups") {
      // Cluster folds cores_0..cores_2 (group "cores"); `ctl` is not a copy.
      val folded = json(
        """{"type":"socle-state",
          | "design":{"top":"Top","modules":[
          |   {"name":"Top","scalaClass":"x.Top","kind":"internal","source":null,"children":[{"name":"cl","type":"Cluster"}]},
          |   {"name":"Cluster","scalaClass":"x.Cluster","kind":"internal","source":null,
          |    "children":[{"name":"cores_0","type":"Core","foldGroup":"cores"},{"name":"ctl","type":"Ctl"},
          |                {"name":"cores_1","type":"Core_1","foldGroup":"cores"},{"name":"cores_2","type":"Core_2","foldGroup":"cores"}]},
          |   {"name":"Core","scalaClass":"x.Core","kind":"internal","source":{"file":"src/Core.scala","line":3},"children":[]},
          |   {"name":"Core_1","scalaClass":"x.Core","kind":"internal","source":null,"children":[]},
          |   {"name":"Core_2","scalaClass":"x.Core","kind":"internal","source":null,"children":[]},
          |   {"name":"Ctl","scalaClass":"x.Ctl","kind":"internal","source":null,"children":[]}
          | ]},
          | "path":["Top","cl"], "selection":"cores",
          | "details":{"name":"cores","module":"Core","scalaClass":"x.Core","kind":"internal","params":[],"ports":[],"copies":3}
          |}""".stripMargin)
      val u = parseUiState(folded).get
      val d = u.design.get.get
      val cl = List("Top", "cl")
      val g  = cl :+ "#cores"
      test("a group is one node where its first copy is, its copies under it") {
        assert(d.modules("Cluster").groups == Map("cores_0" -> "cores", "cores_1" -> "cores", "cores_2" -> "cores"))
        assert(hierChildren(d, cl) == Seq(g, cl :+ "ctl"))
        assert(hierChildren(d, g) == Seq(cl :+ "cores_0", cl :+ "cores_1", cl :+ "cores_2"))
        assert(hierParent(d, cl :+ "cores_1") == Some(g), hierParent(d, g) == Some(cl), hierParent(d, cl :+ "ctl") == Some(cl))
        assert(hierParent(d, List("Top")) == None)
      }
      test("the group row") {
        val r = hierRow(d, g).get
        assert(r.label == "cores × 3", r.description == "Core", r.contextValue == "group", r.expandable)
        assert(r.id == "hier:Top/cl/#cores", r.tooltip.contains("3 generator copies of x.Core"))
        assert(hierRow(d, cl :+ "#nope") == None)
      }
      test("a group click selects the folded box; its source is its first copy's") {
        assert(navigateTarget(d, g) == Some((cl, Some("cores"))))
        assert(navigateTarget(d, cl :+ "cores_1") == Some((cl, Some("cores_1"))))
        assert(moduleSource(d, g) == Some(SourceInfo("src/Core.scala", 3)))
      }
      test("the selected group or copy is revealed") {
        assert(revealPath(d, cl, Some("cores")) == Some(g))
        assert(revealPath(d, cl, Some("cores_2")) == Some(cl :+ "cores_2"))
      }
      test("the details give the copies") {
        val rows = detailRows(u.details.get)
        assert(rows.map(_.label) == Seq("cores", "3 generator copies", "x.Core", "Ports"))
        assert(detailRows(parseUiState(state).get.details.get).forall(_.id != "detail:copies"))
      }
      test("an older server (no foldGroup): every copy is a row") {
        val plain = parseUiState(state).get.design.get.get
        assert(plain.modules.values.forall(_.groups.isEmpty))
        assert(hierChildren(plain, List("DeepSoc")) == Seq(List("DeepSoc", "cluster0"), List("DeepSoc", "pipe")))
      }
    }

    test("detailRows") {
      val det = parseUiState(state).get.details.get
      val rows = detailRows(det)
      assert(rows.map(_.label) == Seq("core", "deephier.Core", "Parameters", "Ports"))
      assert(rows.head.description == "Core", rows(1).description == "Scala class")
      assert(rows(2).children.map(_.label) == Seq("width: Int = 32", "n = 4"))
      assert(rows(3).children.map(r => (r.label, r.description)) == Seq(("clock", "in Clock"), ("io", "out CoreIO")))
      assert(rows(3).description == "2", rows.map(_.id).distinct.size == rows.size)
      // no Scala class, no parameters: those rows are left out
      val bare = detailRows(det.copy(scalaClass = "", params = Nil))
      assert(bare.map(_.label) == Seq("core", "Ports"))
    }

    test("classes") {
      // Cluster: one parameterization; Core: only without parameters; Lane: two that
      // could not be compared (the same label); then a library class.
      val withClasses = json(
        """{"type":"socle-state","path":["DeepSoc"],"selection":null,"details":null,
          | "design":{"top":"DeepSoc","modules":[{"name":"DeepSoc","children":[]}]},
          | "classes":[
          |  {"scalaClass":"deephier.Cluster","name":"Cluster","library":false,"modules":2,"parameterizations":[
          |    {"label":"(nCores = 2)","unknown":false,"params":[{"name":"nCores","type":"Int","value":"2"}],"instances":[
          |      {"path":["DeepSoc","cluster0"],"label":"cluster0","module":"Cluster"},
          |      {"path":["DeepSoc","cluster1"],"label":"cluster1","module":"Cluster_1"}]}]},
          |  {"scalaClass":"deephier.Core","name":"Core","library":false,"modules":2,"parameterizations":[
          |    {"label":"(no parameters)","unknown":false,"params":[],"instances":[
          |      {"path":["DeepSoc","cluster0","cores_0"],"label":"cluster0/cores_0","module":"Core"},
          |      {"path":["DeepSoc","cluster0","cores_1"],"label":"cluster0/cores_1","module":"Core_1"}]}]},
          |  {"scalaClass":"x.Lane","name":"Lane","library":false,"modules":2,"parameterizations":[
          |    {"label":"(f = <unreadable>)","unknown":true,"params":[{"name":"f","type":"","value":"<unreadable>"}],
          |     "instances":[{"path":["DeepSoc","l0"],"label":"l0","module":"Lane"}]},
          |    {"label":"(f = <unreadable>)","unknown":true,"params":[{"name":"f","type":"","value":"<unreadable>"}],
          |     "instances":[{"path":["DeepSoc","l1"],"label":"l1","module":"Lane_1"}]}]},
          |  {"scalaClass":"chisel3.util.Queue","name":"Queue","library":true,"modules":1,"parameterizations":[
          |    {"label":"(entries = 4)","unknown":false,"params":[{"name":"entries","type":"Int","value":"4"}],
          |     "instances":[{"path":["DeepSoc","pipe"],"label":"pipe","module":"Queue4"}]}]}
          | ]}""".stripMargin)
      val cs = parseUiState(withClasses).get.classes.get
      val rows = classRows(cs)
      def all(rs: Seq[Row]): Seq[Row] = rs.flatMap(r => r +: all(r.children))

      test("a row per class, as delivered: collapsed, its module count, its full name") {
        assert(rows.map(_.label) == Seq("Cluster", "Core", "Lane", "Queue"))
        assert(rows.map(_.description) == Seq("2", "2", "2", "1"))
        assert(rows.head.tooltip == "deephier.Cluster", rows.forall(r => r.expandable && !r.expanded))
        assert(rows.map(_.icon) == Seq("symbol-class", "symbol-class", "symbol-class", "package"))
      }
      test("a parameterization: open, its instance count, its instances") {
        val p = rows.head.children.head
        assert(p.label == "(nCores = 2)", p.description == "2", p.expandable, p.expanded)
        assert(p.tooltip == "modules built with the same constructor arguments")
        assert(p.children.map(_.label) == Seq("cluster0", "cluster1"))
        val i = p.children(1)
        assert(i.path == List("DeepSoc", "cluster1"), i.tooltip == "module Cluster_1\nDeepSoc/cluster1", !i.expandable)
      }
      test("a class built only without parameters lists its instances directly") {
        val core = rows(1)
        assert(core.children.map(_.label) == Seq("cluster0/cores_0", "cluster0/cores_1"))
        assert(core.children.map(_.path.last) == Seq("cores_0", "cores_1"))
      }
      test("a parameterization not compared is marked") {
        val lane = rows(2).children
        assert(lane.map(_.label) == Seq("(f = <unreadable>) ?", "(f = <unreadable>) ?"))
        assert(lane.forall(_.tooltip == UnknownParams), lane.map(_.description) == Seq("1", "1"))
      }
      test("distinct ids, though two parameterizations share a label") {
        val ids = all(rows).map(_.id)
        assert(ids.distinct.size == ids.size)
      }
      test("only instances navigate") {
        assert(all(rows).filter(_.path.nonEmpty).map(_.label) ==
          Seq("cluster0", "cluster1", "cluster0/cores_0", "cluster0/cores_1", "l0", "l1", "pipe"))
      }
      test("an older server (no classes): an empty class view") {
        assert(parseUiState(state).get.classes == Some(Nil))
        assert(classRows(Nil) == Nil)
      }
      test("no design: an empty class view; no design key: unchanged") {
        assert(parseUiState(json("""{"type":"socle-state","design":null,"path":[],"selection":null,"details":null}""")).get.classes == Some(Nil))
        assert(parseUiState(json("""{"type":"socle-state","path":["A"],"selection":null,"details":null}""")).get.classes == None)
      }
      test("malformed parts are skipped, the rest of the state kept") {
        val bad = json(
          """{"type":"socle-state","path":["T"],"selection":null,"details":null,
            | "design":{"top":"T","modules":[{"name":"T","children":[]}]},
            | "classes":[7,{"name":"NoClass"},{"scalaClass":"a.A","parameterizations":[
            |   3,{"label":"(no parameters)","params":[],"instances":[{"path":[],"label":"x"},{"path":["T",1],"label":"y"},
            |     {"path":["T","ok"],"label":"ok"}]}]}]}""".stripMargin)
        val u = parseUiState(bad).get
        assert(u.design.get.get.top == "T")
        assert(u.classes == Some(Seq(ClassInfo("a.A", "A", false, 0,
          Seq(ClassParams("(no parameters)", false, Nil, Seq(ClassInstance(List("T", "ok"), "ok", ""))))))))
        assert(parseUiState(json("""{"type":"socle-state","path":[],"selection":null,"details":null,
                                   |"design":{"top":"T","modules":[]},"classes":"x"}""".stripMargin)).get.classes == Some(Nil))
      }
    }

    test("sourcePath") {
      assert(sourcePath("/abs/A.scala", Some("/ws")) == Some("/abs/A.scala"))
      assert(sourcePath("C:\\x\\A.scala", Some("/ws")) == Some("C:\\x\\A.scala"))
      assert(sourcePath("src/A.scala", Some("/ws")) == Some("/ws/src/A.scala"))
      assert(sourcePath("src/A.scala", None) == None)
    }

    test("navigateMessage") {
      val m = navigateMessage(List("DeepSoc", "cluster0"), None).asInstanceOf[js.Dynamic]
      assert(m.`type`.asInstanceOf[String] == "socle-navigate")
      assert(m.path.asInstanceOf[js.Array[String]].toSeq == Seq("DeepSoc", "cluster0"), m.select == null)
      val s = navigateMessage(List("DeepSoc"), Some("pipe")).asInstanceOf[js.Dynamic]
      assert(s.select.asInstanceOf[String] == "pipe")
    }
  }
}
