"""Names used inside a function that neither module scope nor the function defines.

The trap this exists for: an import written INSIDE one function is invisible to
every other function, but a naive AST walk collects it as if it were global.
That is exactly how CARD_COMMISSION_CODE and JournalEntry slipped through.
"""
import ast, builtins, sys


def _bindings(nodes, *, recurse_into_functions):
    out = set()
    stack = list(nodes)
    while stack:
        n = stack.pop()
        if isinstance(n, (ast.Import, ast.ImportFrom)):
            for a in n.names:
                out.add((a.asname or a.name).split(".")[0])
        elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            out.add(n.name)
            if not recurse_into_functions:
                continue
        elif isinstance(n, ast.Name) and isinstance(n.ctx, (ast.Store, ast.Del)):
            out.add(n.id)
        elif isinstance(n, ast.arg):
            out.add(n.arg)
        elif isinstance(n, ast.ExceptHandler) and n.name:
            out.add(n.name)
        elif isinstance(n, ast.Global):
            out.update(n.names)
        stack.extend(ast.iter_child_nodes(n))
    return out


def check(path):
    tree = ast.parse(open(path).read(), path)
    # MODULE scope only — top-level statements, not function bodies.
    module = set(dir(builtins)) | {"__name__", "__file__", "__doc__"}
    module |= _bindings(tree.body, recurse_into_functions=False)

    problems = []
    for fn in [n for n in ast.walk(tree)
               if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]:
        local = _bindings(list(ast.iter_child_nodes(fn)), recurse_into_functions=True)
        local |= {a.arg for a in fn.args.args + fn.args.kwonlyargs + fn.args.posonlyargs}
        if fn.args.vararg: local.add(fn.args.vararg.arg)
        if fn.args.kwarg: local.add(fn.args.kwarg.arg)
        for n in ast.walk(fn):
            if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load):
                if n.id not in module and n.id not in local:
                    problems.append((fn.name, n.lineno, n.id))
    return problems


for p in sys.argv[1:]:
    for fn, line, name in check(p):
        print(f"{p}:{line}  {name}  (in {fn}())")
