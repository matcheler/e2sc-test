// Logic harness for <TICKET>. Copy to e2sc-ui_tests/tests/logic/<TICKET>/<name>.logic.groovy.
// Runs on the dev server (Groovy 2.4.17, no database, no config reload) via loop-verify.sh; from the project root:
//   bash ~/.claude/scripts/loop-verify.sh <TICKET>
// Rules: one tc(...) per approved Logic case, title starts with the case ID. Output lines start with PASS or FAIL
// (loop-verify.sh counts them). Stub every external call (database, files, SCPM); never reach a real service.
// The code under test is loaded from the working copy at $LOGIC_SRC/<repo-relative path>; list each such path in
// sources.txt next to this file. It is RED before the build because the code is missing or unchanged.
def results = []
def tc = { String title, Closure body ->
  try { body(); println "PASS ${title}"; results << true }
  catch (Throwable e) { println "FAIL ${title}"; println "     ${(e.message ?: e.toString()).readLines().take(3).join(' | ')}"; results << false }
}
// eq(expected, actual, 'what') : message names the check, so one failing case still says which assertion failed.
def eq = { expected, actual, String what = '' -> assert expected == actual : "${what} expected [${expected}] got [${actual}]" }

// runTransform(path, input, props, inprops) runs an e2na support-file transform (a script with the injected variables
// props, inprops, outprops, reader, writer: see support_file/Remove3PLFieldValue.groovy) on an input string and
// returns what it wrote. Input and expected output are tab-separated lines, as in the real files.
def runTransform = { String path, String input, Map props = [:], Map inprops = [:] ->
  def out = new StringWriter()
  def binding = new Binding(props: props, inprops: inprops, outprops: [:],
      reader: new BufferedReader(new StringReader(input)), writer: new PrintWriter(out))
  new GroovyShell(binding).evaluate(new File(path))
  binding.writer.flush()
  out.toString()
}

def src = System.getenv('LOGIC_SRC')
// Load the file under test. A missing file throws here, which is the expected RED before the build.
// def unit = new GroovyShell().parse(new File("${src}/solution/project/ssp-ext/E2/e2na/ebl/support_file/<file>.groovy"))

// tc('TC1 (AC1): <what the case proves>') {
//   eq('expected', unit.<function>('input'), 'discriminating check: <what makes this fail on a wrong build>')
// }

println "LOGIC: ${results.count(true)} passed, ${results.count(false)} failed"
System.exit(results && results.every { it } ? 0 : 1)
