import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('sf-profiles-splitter', 'convert');

export default class Convert extends SfCommand<void> {
  public static summary = messages.getMessage('summary');
  public static description = messages.getMessage('description');
  
  public static examples = [
    '$ sf metadata profiles convert -f json -i force-app/main/default/profiles -o force-app/main/default/profiles-json'
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
    format: Flags.string({
      char: 'f',
      summary: messages.getMessage('flags.format.summary'),
      description: messages.getMessage('flags.format.description'),
      options: ['json', 'xml'],
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
  public static aliases = ['metadata:profiles:convert'];

  public async run(): Promise<void> {
    const { flags } = await this.parse(Convert);
    
    const inputDir = flags.input;
    const outputDir = flags.output;
    const format = flags.format;
    const shouldDelete = flags.delete;

    this.log(`Converting profiles from ${inputDir} to ${format} format in ${outputDir}`);
    
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
      await this.convertProfile(profileFile, outputDir, format);
    }

    // Delete the original files if requested
    if (shouldDelete) {
      for (const profileFile of profileFiles) {
        fs.unlinkSync(profileFile);
        this.log(`Deleted original file: ${profileFile}`);
      }
    }

    this.log('Profile conversion completed successfully');
  }

  private async convertProfile(profileFile: string, outputDir: string, format: string): Promise<void> {
    const profileName = path.basename(profileFile, '.profile-meta.xml');
    this.log(`Converting profile: ${profileName} to ${format}`);

    const profileContent = fs.readFileSync(profileFile, 'utf-8');
    const parser = new xml2js.Parser();
    
    try {
      const result = await parser.parseStringPromise(profileContent);
      
      let outputContent: string;
      let outputFileName: string;
      
      if (format === 'json') {
        // Convert to JSON
        outputContent = JSON.stringify(result, null, 2);
        outputFileName = `${profileName}.json`;
      } else {
        // Format XML
        const builder = new xml2js.Builder({ prettyPrint: true });
        outputContent = builder.buildObject(result);
        outputFileName = `${profileName}.profile-meta.xml`;
      }
      
      // Write the output file
      const outputFile = path.join(outputDir, outputFileName);
      fs.writeFileSync(outputFile, outputContent);
      this.log(`Created converted profile: ${outputFile}`);
    } catch (error) {
      this.error(`Error converting profile ${profileName}: ${error.message}`);
    }
  }
}
