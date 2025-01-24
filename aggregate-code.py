import os
from pathlib import Path

def generate_project_tree(root_path, indent="", ignore_patterns=None):
    """Generate a tree structure of the project directory."""
    if ignore_patterns is None:
        ignore_patterns = ['.git', '__pycache__', '.idea', '.vscode']
    
    tree_str = ""
    root = Path(root_path)
    
    # Get all items in directory
    items = sorted(root.glob('*'))
    
    for item in items:
        # Skip ignored patterns
        if any(pattern in str(item) for pattern in ignore_patterns):
            continue
            
        # Add item to tree
        tree_str += f"{indent}├── {item.name}\n"
        
        # Recursively add subdirectories
        if item.is_dir():
            tree_str += generate_project_tree(item, indent + "│   ", ignore_patterns)
            
    return tree_str

def aggregate_code(file_paths, output_file="aggregated_code.txt"):
    """Aggregate code from specified file paths into a single file."""
    with open(output_file, 'w', encoding='utf-8') as outfile:
        for file_path in file_paths:
            try:
                # Write file path as header
                outfile.write(f"\n{'='*80}\n")
                outfile.write(f"File: {file_path}\n")
                outfile.write(f"{'='*80}\n\n")
                
                # Read and write file content
                with open(file_path, 'r', encoding='utf-8') as infile:
                    content = infile.read()
                    outfile.write(content)
                    outfile.write("\n")
                    
            except Exception as e:
                outfile.write(f"Error reading file {file_path}: {str(e)}\n")

def main():
    # Specify your root directory
    root_dir = "."  # Current directory, change as needed
    
    # Generate and print project tree
    print("\nProject Tree Structure:")
    print(f"Root: {root_dir}")
    print(generate_project_tree(root_dir))
    
    # Specify the files you want to aggregate
    files_to_aggregate = [
        # "./scripts/collision-system.js",
        "./scripts/constants.js",
        "./scripts/main.js",
        # "./scripts/player.js",
        # "./scripts/renderer.js",
        # "./scripts/utils.js",
        "./scripts/world.js",
        # "./index.html",
        "./scripts/chunksWorker.js",
        "./scripts/geometryWorker.js",
        # Add more file paths as needed
    ]
    
    # Aggregate the code
    aggregate_code(files_to_aggregate, "aggregated_code.txt")
    print(f"\nCode has been aggregated into 'aggregated_code.txt'")

if __name__ == "__main__":
    main()