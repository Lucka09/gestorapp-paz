#!/usr/bin/env python3
"""
Script para agregar paginación a ReportesPage.tsx
Modifica 3 secciones principales para mostrar todos los trámites con paginación
"""

import re
import sys

def agregar_paginacion_reportes():
    filepath = "src/features/reportes/ReportesPage.tsx"
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            contenido = f.read()
        
        original = contenido
        
        # ═══════════════════════════════════════════════════════════════════
        # PASO 1: Agregar imports
        # ═══════════════════════════════════════════════════════════════════
        
        # Buscar la sección de imports
        import_section = contenido.find('import { useGestoriaContext }')
        if import_section != -1:
            # Buscar dónde terminan los imports (primer línea no-import después)
            lines = contenido.split('\n')
            insert_line = 0
            for i, line in enumerate(lines):
                if 'import' in line and i > 10:
                    insert_line = i + 1
            
            # Insertar imports
            imports_to_add = [
                "import { usePaginacion }     from '@/hooks/usePaginacion'",
                "import ControlPaginacion     from '@/components/shared/ControlPaginacion'"
            ]
            
            for imp in imports_to_add:
                if imp not in contenido:
                    lines.insert(insert_line, imp)
                    insert_line += 1
            
            contenido = '\n'.join(lines)
            print("✅ Imports agregados")
        
        # ═══════════════════════════════════════════════════════════════════
        # PASO 2: Agregar usePaginacion hook
        # ═══════════════════════════════════════════════════════════════════
        
        # Buscar la línea donde se define tramitesMes
        tramites_mes_match = re.search(
            r'(const tramitesMes = .*?\n)',
            contenido,
            re.DOTALL
        )
        
        if tramites_mes_match:
            end_pos = tramites_mes_match.end()
            hook_line = "  const pag = usePaginacion(tramitesMes, { porPagina: 20 })\n"
            
            if 'const pag = usePaginacion' not in contenido:
                contenido = contenido[:end_pos] + hook_line + contenido[end_pos:]
                print("✅ Hook usePaginacion agregado")
        
        # ═══════════════════════════════════════════════════════════════════
        # PASO 3: Reemplazar .slice(0, 20) por pag.itemsPagina
        # ═══════════════════════════════════════════════════════════════════
        
        contenido = contenido.replace(
            '{tramitesMes.slice(0, 20).map(t => (',
            '{pag.itemsPagina.map(t => ('
        )
        print("✅ Lista reemplazada por paginación")
        
        # ═══════════════════════════════════════════════════════════════════
        # PASO 4: Reemplazar el mensaje de paginación por ControlPaginacion
        # ═══════════════════════════════════════════════════════════════════
        
        old_pagination = r'\{tramitesMes\.length > 20 && \(\s*<div className="px-5 py-3 text-center text-xs text-gray-400">\s*Mostrando 20 de \{tramitesMes\.length\} · El PDF incluye todos\s*</div>\s*\)\}'
        
        new_pagination = '''<div className="px-5 py-4 border-t border-gray-100 space-y-2">
              {tramitesMes.length > 20 && (
                <ControlPaginacion
                  pagina={pag.pagina}
                  paginas={pag.paginas}
                  desde={pag.desde}
                  hasta={pag.hasta}
                  total={pag.total}
                  onChange={pag.setPagina}
                  labelItem="trámites"
                />
              )}
            </div>'''
        
        contenido = re.sub(old_pagination, new_pagination, contenido)
        print("✅ Componente ControlPaginacion integrado")
        
        # Guardar
        if contenido != original:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(contenido)
            print(f"\n✅ Archivo {filepath} actualizado correctamente")
            return True
        else:
            print("⚠️  No se realizaron cambios (posible estructura diferente)")
            return False
            
    except FileNotFoundError:
        print(f"❌ Error: No se encontró {filepath}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    print("🔧 Agregando paginación a ReportesPage.tsx...\n")
    if agregar_paginacion_reportes():
        print("\n🎉 Paginación agregada exitosamente")
        print("\nAhora:")
        print("  1. npm run build")
        print("  2. npm run dev")
        print("  3. Recarga GestorApp (F5)")
        print("  4. Reportes → Junio 2026 → Deberías ver paginación abajo")