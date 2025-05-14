import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('sf-profiles-splitter', 'split');

export default class Split extends SfCommand<void> {
  public static summary = messages.getMessage('summary');
  public static description = messages.getMessage('description');
  
  public static examples = [
    '$ sf metadata profiles split -i force-app/main/default/profiles -o force-app/main/default/profiles-split'
  ];

  public static flags = {
    input: Flags.directory({
      char: 'i',
      summary: messages.getMessage('flags.input.summary'),
      description: messages.getMessage('flags.input.description'),
      default: 'force-app/main/default/profiles',
      required: true
    }),
    output: Flags.directory({
      char: 'o',
      summary: messages.getMessage('flags.output.summary'),
      description: messages.getMessage('flags.output.description'),
      default: 'force-app/main/default/profiles',
      required: true
    }),
    delete: Flags.boolean({
      char: 'd',
      summary: messages.getMessage('flags.delete.summary'),
      description: messages.getMessage('flags.delete.description'),
      default: false
    })
  };

  // For backward compatibility during transition
  public static deprecateAliases = true;
  // This allows the old command format to still work
  public static aliases = ['metadata:profiles:split'];

  public async run(): Promise<void> {
    const { flags } = await this.parse(Split);
    
    const inputDir = flags.input;
    const outputDir = flags.output;
    const shouldDelete = flags.delete;

    this.log(`Splitting profiles from ${inputDir} to ${outputDir}`);
    
    // Check if the input directory exists
    if (!fs.existsSync(inputDir)) {
      throw new Error(`Input directory ${inputDir} does not exist`);
    }

    // Create the output directory if it does not exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Get all XML files from the input directory
    const profileFiles = fs.readdirSync(inputDir)
      .filter(file => file.endsWith('.profile-meta.xml'))
      .map(file => path.join(inputDir, file));

    if (profileFiles.length === 0) {
      this.log('No profile files found in the input directory');
      return;
    }

    this.log(`Found ${profileFiles.length} profile files`);

    // Process each profile file
    for (const profileFile of profileFiles) {
      await this.splitProfile(profileFile, outputDir);
    }

    // Delete the original files if requested
    if (shouldDelete) {
      for (const profileFile of profileFiles) {
        fs.unlinkSync(profileFile);
        this.log(`Deleted original file: ${profileFile}`);
      }
    }

    this.log('Profile splitting completed successfully');
  }

  private async splitProfile(profileFile: string, outputDir: string): Promise<void> {
    const profileName = path.basename(profileFile, '.profile-meta.xml');
    this.log(`Processing profile: ${profileName}`);

    const profileContent = fs.readFileSync(profileFile, 'utf-8');
    const parser = new xml2js.Parser();
    
    try {
      const result = await parser.parseStringPromise(profileContent);
      const profile = result.Profile;

      // Create a directory for this profile
      const profileDir = path.join(outputDir, profileName);
      if (!fs.existsSync(profileDir)) {
        fs.mkdirSync(profileDir, { recursive: true });
      }

      // Split each category of permissions
      for (const [key, value] of Object.entries(profile)) {
        if (Array.isArray(value) && value.length > 0) {
          // Create a directory for this category
          const categoryDir = path.join(profileDir, key);
          if (!fs.existsSync(categoryDir)) {
            fs.mkdirSync(categoryDir, { recursive: true });
          }

          // Process each item in the category
          for (const item of value) {
            if (typeof item === 'object') {
              // Generate a unique name for this item
              let itemName = '';
              
              // Determine the name of the item based on common properties
              if (item.name) {
                itemName = item.name[0];
              } else if (item.application && item.application[0]) {
                itemName = item.application[0];
              } else if (item.layout && item.layout[0]) {
                itemName = item.layout[0].replace(/\//g, '-');
              } else if (item.object && item.object[0]) {
                itemName = item.object[0];
              } else if (item.field && item.field[0]) {
                itemName = item.field[0].replace(/\./g, '-');
              } else if (item.apexClass && item.apexClass[0]) {
                itemName = item.apexClass[0];
              } else if (item.apexPage && item.apexPage[0]) {
                itemName = item.apexPage[0];
              } else {
                // Generate a random name if no identifiable property exists
                itemName = `item-${Math.floor(Math.random() * 10000)}`;
              }

              // Create a new XML structure for this item
              const builder = new xml2js.Builder();
              const itemXml = builder.buildObject({ Profile: { [key]: [item], _xmlns: profile._xmlns } });

              // Write the item to a file
              const itemFileName = `${itemName}.xml`;
              const itemPath = path.join(categoryDir, itemFileName);
              fs.writeFileSync(itemPath, itemXml);
              this.log(`  Created: ${path.relative(outputDir, itemPath)}`);
            }
          }
        }
      }
    } catch (error) {
      this.error(`Error processing profile ${profileName}: ${error.message}`);
    }
  }
}
