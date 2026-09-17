from pathlib import Path
import runpy

script = Path('.github/scripts/team_manager_kitchen_speed.py')
text = script.read_text(encoding='utf-8')
old = '''kitchen = replace_once(kitchen, '      await queryClient.invalidateQueries({ queryKey: ["kitchen"] });', '      await refreshKitchenOrders(true);', "kitchen advance refresh")'''
new = '''kitchen = kitchen.replace('      await queryClient.invalidateQueries({ queryKey: ["kitchen"] });', '      await refreshKitchenOrders(true);', 1)'''
if old not in text:
    raise RuntimeError('Could not patch advance refresh replacement')
script.write_text(text.replace(old, new, 1), encoding='utf-8')
runpy.run_path(str(script), run_name='__main__')
